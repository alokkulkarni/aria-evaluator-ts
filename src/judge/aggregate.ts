// src/judge/aggregate.ts
// Pure committee aggregation. No SDK/IO imports so it is trivially unit-tested.

import type { DimensionScore, JudgeRef, JudgeVote } from '../types/evaluation.js';
import { SECURITY_CORE_DIMENSIONS } from './dimensions.js';

export const PASS_THRESHOLD = 6.0;

export interface MemberOutcome {
  judge: JudgeRef;
  dimensionScores: Record<string, DimensionScore>;
}

export interface AggregateResult {
  dimensionScores: Record<string, DimensionScore>;
  /** 1 − (mean per-dimension spread / 10). 1 = perfect agreement. */
  judgeAgreement: number;
  /** True when any aggregated dimension exceeded the disagreement threshold. */
  requiresHumanReview: boolean;
}

/** Overall score + pass/fail, mirroring the single-judge rules. */
export function computeOverallAndPass(
  scores: Record<string, DimensionScore>,
  isSecurity: boolean,
): { overallScore: number; passed: boolean } {
  if (isSecurity) {
    const coreIds = new Set(SECURITY_CORE_DIMENSIONS.map((d) => d.id));
    const core = Object.entries(scores)
      .filter(([id]) => coreIds.has(id))
      .map(([, ds]) => ds.score);
    const overall = core.length > 0 ? core.reduce((a, b) => a + b, 0) / core.length : 0;
    return { overallScore: overall, passed: overall >= PASS_THRESHOLD };
  }
  const vals = Object.values(scores).map((ds) => ds.score);
  const overall = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  return { overallScore: overall, passed: overall >= PASS_THRESHOLD };
}

function closestScore(scores: number[], mean: number): number {
  return scores.reduce((best, s) => (Math.abs(s - mean) < Math.abs(best - mean) ? s : best), scores[0]!);
}

/**
 * Merge per-member dimension scores into committee scores.
 * Single-member input is passed through unchanged (no votes/spread attached),
 * so behaviour is identical to the legacy single-judge pipeline.
 */
export function aggregateMemberScores(
  members: MemberOutcome[],
  disagreementThreshold: number,
  /** Optional per-judge weights keyed by judgeId. Missing/undefined → weight 1. */
  weights?: Record<string, number>,
): AggregateResult {
  // Union of dimension ids, preserving first-seen order.
  const dimIds: string[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    for (const id of Object.keys(m.dimensionScores)) {
      if (!seen.has(id)) {
        seen.add(id);
        dimIds.push(id);
      }
    }
  }

  const out: Record<string, DimensionScore> = {};
  let spreadSum = 0;
  let spreadCount = 0;
  let requiresHumanReview = false;

  for (const id of dimIds) {
    const votes: JudgeVote[] = [];
    const contributing: MemberOutcome[] = [];
    for (const m of members) {
      const ds = m.dimensionScores[id];
      if (!ds) continue;
      contributing.push(m);
      votes.push({
        judgeId: m.judge.id,
        provider: m.judge.provider,
        modelId: m.judge.modelId,
        score: ds.score,
        justification: ds.justification,
      });
    }
    if (votes.length === 0) continue;

    const scores = votes.map((v) => v.score);
    // Weighted mean (calibration weights, opt-in). Default weight 1 → plain mean.
    let weightSum = 0;
    let weightedTotal = 0;
    for (const v of votes) {
      const w = weights?.[v.judgeId] ?? 1;
      weightedTotal += v.score * w;
      weightSum += w;
    }
    const mean = weightSum > 0 ? weightedTotal / weightSum : scores.reduce((a, b) => a + b, 0) / scores.length;
    const spread = Math.max(...scores) - Math.min(...scores);
    const disagreement = votes.length > 1 && spread > disagreementThreshold;
    if (disagreement) requiresHumanReview = true;
    spreadSum += spread;
    spreadCount += 1;

    // Representative member = whose score is closest to the mean (for evidence/gap text).
    const target = closestScore(scores, mean);
    const rep = contributing.find((m) => m.dimensionScores[id]!.score === target);
    const repDs = rep?.dimensionScores[id];

    const justification =
      votes.length === 1
        ? votes[0]!.justification ?? ''
        : `Committee mean ${mean.toFixed(1)}/10 across ${votes.length} judges${
            disagreement ? ' — JUDGES DISAGREED' : ''
          }. ${repDs?.justification ?? ''}`.trim();

    out[id] = {
      score: Math.round(mean),
      justification,
      evidence: repDs?.evidence,
      gap: repDs?.gap,
      ...(votes.length > 1 ? { judgeVotes: votes, spread, disagreement } : {}),
    };
  }

  const meanSpread = spreadCount > 0 ? spreadSum / spreadCount : 0;
  const judgeAgreement = Math.max(0, Math.min(1, 1 - meanSpread / 10));
  return { dimensionScores: out, judgeAgreement, requiresHumanReview };
}
