// src/api/calibration-service.ts
// DB-facing calibration: derive labels from human reviews, recompute per-judge
// agreement (κ) against those labels using the per-judge votes Phase 1 stored,
// and expose calibrated committee weights.

import { prisma } from '../db/client.js';
import type { DimensionScore } from '../types/evaluation.js';
import type { Transcript } from '../types/transcript.js';
import {
  classifyTrust,
  computeCalibrationStats,
  weightForCalibration,
  type ScorePair,
  type TrustLevel,
} from '../lib/calibration.js';
import { getCalibrationThresholds, getJudgeCommitteeConfig } from './runtime-settings.js';
import { JudgePanel } from '../judge/judge-panel.js';

interface ReviewLike {
  runId: string;
  status: string;
  reviewedBy: string | null;
  dimensionOverridesJson: string | null;
}

/**
 * Turn a completed human review's per-dimension overrides into calibration labels
 * (ground truth). Idempotent via the (runId, dimensionId, source) unique key.
 * Returns the number of labels written.
 */
export async function deriveLabelsFromReview(review: ReviewLike): Promise<number> {
  if (review.status !== 'approved' && review.status !== 'overridden') return 0;
  if (!review.dimensionOverridesJson) return 0;

  let overrides: Record<string, { score?: number; notes?: string }>;
  try {
    overrides = JSON.parse(review.dimensionOverridesJson);
  } catch {
    return 0;
  }

  let count = 0;
  for (const [dimensionId, ov] of Object.entries(overrides)) {
    if (!ov || typeof ov.score !== 'number') continue;
    await prisma.calibrationLabel.upsert({
      where: { runId_dimensionId_source: { runId: review.runId, dimensionId, source: 'review' } },
      update: { humanScore: ov.score, labeledBy: review.reviewedBy ?? null },
      create: {
        runId: review.runId,
        dimensionId,
        source: 'review',
        humanScore: ov.score,
        labeledBy: review.reviewedBy ?? null,
      },
    });
    count++;
  }
  return count;
}

interface PairBucket {
  provider: string;
  modelId: string;
  dimensionId: string | null; // null = overall across dimensions
  pairs: ScorePair[];
}

function bucketKey(provider: string, modelId: string, dimensionId: string | null): string {
  return `${provider}${modelId}${dimensionId ?? '*'}`;
}

/**
 * Recompute calibration for a scope (a dataset, or global when datasetId is
 * omitted). Pairs each human label with the per-judge votes recorded on the
 * run's EvalResult, then writes fresh JudgeCalibration rows (delete + insert so
 * we don't rely on SQLite's NULL-in-unique behaviour).
 */
export async function recomputeCalibration(datasetId?: string): Promise<{ judges: number; samples: number }> {
  const thresholds = getCalibrationThresholds();
  const dsId = datasetId ?? null;

  const labels = await prisma.calibrationLabel.findMany({
    where: datasetId ? { datasetId } : {},
  });

  if (labels.length === 0) {
    await prisma.judgeCalibration.deleteMany({ where: { datasetId: dsId } });
    return { judges: 0, samples: 0 };
  }

  const runIds = [...new Set(labels.map((l) => l.runId))];
  const evals = await prisma.evalResult.findMany({
    where: { runId: { in: runIds } },
    select: { runId: true, judgeModel: true, dimensionScores: true },
  });
  const evalByRun = new Map(evals.map((e) => [e.runId, e]));

  const buckets = new Map<string, PairBucket>();
  const add = (provider: string, modelId: string, dimensionId: string | null, judgeScore: number, humanScore: number) => {
    const k = bucketKey(provider, modelId, dimensionId);
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = { provider, modelId, dimensionId, pairs: [] };
      buckets.set(k, bucket);
    }
    bucket.pairs.push([judgeScore, humanScore]);
  };

  let samples = 0;
  for (const label of labels) {
    const ev = evalByRun.get(label.runId);
    if (!ev) continue;
    let dims: Record<string, DimensionScore>;
    try {
      dims = JSON.parse(ev.dimensionScores);
    } catch {
      continue;
    }
    const ds = dims[label.dimensionId];
    if (!ds) continue;

    if (ds.judgeVotes && ds.judgeVotes.length > 0) {
      for (const vote of ds.judgeVotes) {
        add(vote.provider, vote.modelId, label.dimensionId, vote.score, label.humanScore);
        add(vote.provider, vote.modelId, null, vote.score, label.humanScore);
        samples++;
      }
    } else {
      // Single-judge / pre-Phase-1 result: treat the aggregate dimension score as one judge.
      add('bedrock', ev.judgeModel, label.dimensionId, ds.score, label.humanScore);
      add('bedrock', ev.judgeModel, null, ds.score, label.humanScore);
      samples++;
    }
  }

  const rows = [...buckets.values()].map((bucket) => {
    const stats = computeCalibrationStats(bucket.pairs);
    return {
      judgeProvider: bucket.provider,
      judgeModelId: bucket.modelId,
      dimensionId: bucket.dimensionId,
      datasetId: dsId,
      sampleCount: stats.sampleCount,
      weightedKappa: stats.weightedKappa,
      binaryKappa: stats.binaryKappa,
      withinOneRate: stats.withinOneRate,
      exactAgreement: stats.exactAgreement,
      meanAbsError: stats.meanAbsError,
      trust: classifyTrust(stats.weightedKappa, stats.sampleCount, thresholds),
    };
  });

  await prisma.$transaction([
    prisma.judgeCalibration.deleteMany({ where: { datasetId: dsId } }),
    prisma.judgeCalibration.createMany({ data: rows }),
  ]);

  return { judges: rows.length, samples };
}

export interface GoldenItem {
  scenarioName?: string;
  goal?: string;
  attack_type?: string;
  domain?: string;
  transcript: { turns: Array<{ role: string; content: string }> };
  /** dimensionId → human ground-truth score (0–10). */
  labels: Record<string, number>;
}

/**
 * External golden-set calibration anchor: evaluate each imported transcript with
 * the live committee, pair each judge's vote against the human label, and write
 * κ rows for the dataset. Lets you calibrate against a curated external set
 * before internal review labels accumulate.
 *
 * NOTE: this uses our ABSOLUTE per-dimension κ framework. LMSYS Arena data is
 * *pairwise preference* data and must first be converted to per-dimension
 * absolute scores to be used here.
 *
 * Makes real judge LLM calls (one committee evaluation per item) — callers run it
 * in the background, not inline with an HTTP response.
 */
export async function calibrateExternalGoldenSet(
  items: GoldenItem[],
  datasetId: string | null,
): Promise<{ judges: number; samples: number; items: number }> {
  const thresholds = getCalibrationThresholds();
  const panel = new JudgePanel(getJudgeCommitteeConfig());

  const buckets = new Map<string, PairBucket>();
  const add = (provider: string, modelId: string, dimensionId: string | null, judgeScore: number, humanScore: number) => {
    const k = bucketKey(provider, modelId, dimensionId);
    let bucket = buckets.get(k);
    if (!bucket) {
      bucket = { provider, modelId, dimensionId, pairs: [] };
      buckets.set(k, bucket);
    }
    bucket.pairs.push([judgeScore, humanScore]);
  };

  let samples = 0;
  let evaluated = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    if (!item?.transcript?.turns || !item.labels) continue;
    const transcript = {
      id: `golden-${datasetId ?? 'adhoc'}-${i}`,
      scenarioName: item.scenarioName ?? `golden-${i}`,
      turns: item.transcript.turns,
      escalated: false,
    } as unknown as Transcript;

    let dims: Record<string, DimensionScore>;
    let judgesRef: { provider: string; modelId: string }[];
    try {
      const result = await panel.evaluate(transcript, item.goal ?? 'evaluate', {
        attack_type: item.attack_type,
        domain: item.domain,
      });
      dims = result.dimensionScores;
      judgesRef = result.judges ?? [];
    } catch {
      continue;
    }
    evaluated++;

    for (const [dimId, humanScore] of Object.entries(item.labels)) {
      if (typeof humanScore !== 'number') continue;
      const ds = dims[dimId];
      if (!ds) continue;
      if (ds.judgeVotes && ds.judgeVotes.length > 0) {
        for (const v of ds.judgeVotes) {
          add(v.provider, v.modelId, dimId, v.score, humanScore);
          add(v.provider, v.modelId, null, v.score, humanScore);
          samples++;
        }
      } else if (judgesRef[0]) {
        // Single-judge committee: the aggregate score is that judge's score.
        add(judgesRef[0].provider, judgesRef[0].modelId, dimId, ds.score, humanScore);
        add(judgesRef[0].provider, judgesRef[0].modelId, null, ds.score, humanScore);
        samples++;
      }
    }
  }

  const rows = [...buckets.values()].map((bucket) => {
    const stats = computeCalibrationStats(bucket.pairs);
    return {
      judgeProvider: bucket.provider,
      judgeModelId: bucket.modelId,
      dimensionId: bucket.dimensionId,
      datasetId,
      sampleCount: stats.sampleCount,
      weightedKappa: stats.weightedKappa,
      binaryKappa: stats.binaryKappa,
      withinOneRate: stats.withinOneRate,
      exactAgreement: stats.exactAgreement,
      meanAbsError: stats.meanAbsError,
      trust: classifyTrust(stats.weightedKappa, stats.sampleCount, thresholds),
    };
  });

  await prisma.$transaction([
    prisma.judgeCalibration.deleteMany({ where: { datasetId } }),
    prisma.judgeCalibration.createMany({ data: rows }),
  ]);

  return { judges: rows.length, samples, items: evaluated };
}

export interface JudgeWeight {
  weight: number;
  trust: TrustLevel;
}

/**
 * Calibrated committee weights keyed by judge modelId, from the global overall
 * calibration rows. Consumed by run-executor to inject JUDGE_WEIGHTS.
 */
export async function getJudgeWeights(): Promise<Record<string, JudgeWeight>> {
  const rows = await prisma.judgeCalibration.findMany({
    where: { dimensionId: null, datasetId: null },
  });
  const out: Record<string, JudgeWeight> = {};
  for (const r of rows) {
    const trust = r.trust as TrustLevel;
    out[r.judgeModelId] = { weight: weightForCalibration({ trust, withinOneRate: r.withinOneRate }), trust };
  }
  return out;
}
