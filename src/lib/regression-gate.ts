// src/lib/regression-gate.ts
// CI regression gate: turns a finished CLI run into an exit-code decision.
//
// Pure module — no filesystem or process access — so the gate decision is
// trivially unit-tested. File IO (reading/writing the baseline JSON) and
// process.exit live in src/cli/run.ts.
//
// The baseline lives in a versioned JSON file (checked into the repo or kept
// as a CI artifact) rather than the Baseline DB table, so CI runs need no
// database. The comparison itself is delegated to the existing
// detectRegression() from ./metrics.js — this module only bridges the file
// format into the Baseline shape that function expects.

import type { Baseline } from '@prisma/client';

import type { EvalResult } from '../types/evaluation.js';
import type { Transcript } from '../types/transcript.js';
import {
  calculateDimensionStats,
  detectRegression,
  type DimensionStats,
  type RegressionReport,
  type ScenarioMetricsSnapshot,
} from './metrics.js';

export const GATE_BASELINE_VERSION = 1;

/**
 * Exit code for a failed quality gate — distinct from 1 (operational error:
 * missing env, no scenarios, unreadable baseline) so CI pipelines can tell
 * "the run broke" from "the agent regressed".
 */
export const EXIT_GATE_FAILED = 3;

export type GateSeverity = 'low' | 'medium' | 'critical';

export interface GateThresholds {
  /** Percentage-point pass-rate drop that counts as CRITICAL (default 5). */
  passRateDrop?: number;
  /** Absolute 0–10 score drop that counts as MEDIUM (default 0.5). */
  scoreDrop?: number;
  /** Percentage latency increase that counts as LOW (default 20). */
  latencyIncrease?: number;
}

/** Versioned on-disk baseline format (see --update-baseline in the CLI). */
export interface GateBaselineFile {
  version: typeof GATE_BASELINE_VERSION;
  name: string;
  createdAt: string;
  /** Committee config hash at bless time — drift means scores aren't comparable. */
  judgeConfigHash: string | null;
  totalRuns: number;
  /** 0–1 fraction. */
  passRate: number;
  /** 0–10. */
  avgScore: number;
  avgLatencyMs: number;
  dimensionIds: string[];
  dimensionMetrics: Record<string, DimensionStats>;
  thresholds?: GateThresholds;
}

export interface GateOptions {
  /** Absolute pass-rate floor in percent (0–100). Applied even without a baseline. */
  minPassRate?: number;
  /** Regression severity at/above which the gate fails. */
  failOn: GateSeverity;
  /** Treat a judge-config mismatch with the baseline as a failure (default: warn only). */
  failOnDrift?: boolean;
  /** Hash of the committee that scored this run (from EvalResult.judgeConfigHash). */
  currentJudgeConfigHash?: string | null;
}

export interface GateDecision {
  passed: boolean;
  /** 0 on pass, EXIT_GATE_FAILED on any gate failure. */
  exitCode: number;
  /** Failure reasons — empty when the gate passes. */
  reasons: string[];
  /** Non-fatal findings worth printing (sub-threshold regressions, judge drift). */
  warnings: string[];
  severity: RegressionReport['severity'] | null;
  report: RegressionReport | null;
  judgeDrift: boolean;
}

const FAIL_ON_RANK: Record<GateSeverity, number> = { low: 1, medium: 2, critical: 3 };
const SEVERITY_RANK: Record<RegressionReport['severity'], number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  CRITICAL: 3,
};

/**
 * Aggregate a finished run's in-memory results into the same snapshot shape
 * the DB-backed metrics pipeline produces. Latency is the wall-clock length of
 * each conversation (transcript startedAt → completedAt); transcripts without
 * a completedAt are excluded from the average.
 */
export function snapshotFromResults(
  results: EvalResult[],
  transcripts: Transcript[],
): ScenarioMetricsSnapshot {
  let passCount = 0;
  let totalScore = 0;
  const dimensionScores: Record<string, number[]> = {};

  for (const r of results) {
    if (r.passed) passCount++;
    totalScore += r.overallScore;
    for (const [dimId, ds] of Object.entries(r.dimensionScores)) {
      (dimensionScores[dimId] ??= []).push(ds.score);
    }
  }

  const durations = transcripts
    .map((t) => (t.completedAt ? Date.parse(t.completedAt) - Date.parse(t.startedAt) : Number.NaN))
    .filter((d) => Number.isFinite(d) && d >= 0);
  const avgLatencyMs =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;

  const dimensionMetrics: Record<string, DimensionStats> = {};
  for (const [dimId, scores] of Object.entries(dimensionScores)) {
    dimensionMetrics[dimId] = calculateDimensionStats(scores);
  }

  return {
    totalRuns: results.length,
    passRate: results.length > 0 ? passCount / results.length : 0,
    avgScore: results.length > 0 ? totalScore / results.length : 0,
    avgLatencyMs,
    dimensionMetrics,
  };
}

/** Capture the finished run as a new baseline file (the CI "bless" step). */
export function buildGateBaseline(
  results: EvalResult[],
  transcripts: Transcript[],
  opts: { name?: string; judgeConfigHash?: string | null; thresholds?: GateThresholds; now?: string } = {},
): GateBaselineFile {
  const snapshot = snapshotFromResults(results, transcripts);
  return {
    version: GATE_BASELINE_VERSION,
    name: opts.name ?? 'ci-baseline',
    createdAt: opts.now ?? new Date().toISOString(),
    judgeConfigHash:
      opts.judgeConfigHash ?? results.find((r) => r.judgeConfigHash)?.judgeConfigHash ?? null,
    totalRuns: snapshot.totalRuns,
    passRate: snapshot.passRate,
    avgScore: snapshot.avgScore,
    avgLatencyMs: snapshot.avgLatencyMs,
    dimensionIds: Object.keys(snapshot.dimensionMetrics),
    dimensionMetrics: snapshot.dimensionMetrics,
    ...(opts.thresholds ? { thresholds: opts.thresholds } : {}),
  };
}

/** Parse + validate a baseline file. Throws with an actionable message. */
export function parseGateBaselineFile(raw: string): GateBaselineFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Baseline file is not valid JSON.');
  }
  const b = parsed as Record<string, unknown>;
  if (b['version'] !== GATE_BASELINE_VERSION) {
    throw new Error(
      `Unsupported baseline version ${String(b['version'])} — expected ${GATE_BASELINE_VERSION}. Re-create it with --update-baseline.`,
    );
  }
  for (const field of ['name', 'createdAt'] as const) {
    if (typeof b[field] !== 'string') throw new Error(`Baseline file is missing string field "${field}".`);
  }
  for (const field of ['totalRuns', 'passRate', 'avgScore', 'avgLatencyMs'] as const) {
    if (typeof b[field] !== 'number' || !Number.isFinite(b[field])) {
      throw new Error(`Baseline file is missing numeric field "${field}".`);
    }
  }
  if (!Array.isArray(b['dimensionIds']) || !b['dimensionIds'].every((d) => typeof d === 'string')) {
    throw new Error('Baseline file is missing string-array field "dimensionIds".');
  }
  if (typeof b['dimensionMetrics'] !== 'object' || b['dimensionMetrics'] == null) {
    throw new Error('Baseline file is missing object field "dimensionMetrics".');
  }
  const out: GateBaselineFile = {
    version: GATE_BASELINE_VERSION,
    name: b['name'] as string,
    createdAt: b['createdAt'] as string,
    judgeConfigHash: typeof b['judgeConfigHash'] === 'string' ? b['judgeConfigHash'] : null,
    totalRuns: b['totalRuns'] as number,
    passRate: b['passRate'] as number,
    avgScore: b['avgScore'] as number,
    avgLatencyMs: b['avgLatencyMs'] as number,
    dimensionIds: b['dimensionIds'] as string[],
    dimensionMetrics: b['dimensionMetrics'] as Record<string, DimensionStats>,
  };
  if (typeof b['thresholds'] === 'object' && b['thresholds'] != null) {
    out.thresholds = b['thresholds'] as GateThresholds;
  }
  return out;
}

/**
 * Bridge the file format into the Prisma Baseline shape detectRegression()
 * expects. Only passRate/avgScore/avgLatencyMs and the three *Json fields are
 * read by detectRegression; the rest are placeholders.
 */
function toPrismaBaseline(file: GateBaselineFile): Baseline {
  return {
    id: 'cli-gate-baseline',
    name: file.name,
    scenarioId: 'cli-gate',
    totalRuns: file.totalRuns,
    passRate: file.passRate,
    avgScore: file.avgScore,
    avgLatencyMs: file.avgLatencyMs,
    dimensionIdsJson: JSON.stringify(file.dimensionIds),
    dimensionMetricsJson: JSON.stringify(file.dimensionMetrics),
    judgeModel: '',
    judgeVersion: 0,
    judgeConfigHash: file.judgeConfigHash,
    thresholdOverridesJson: file.thresholds ? JSON.stringify(file.thresholds) : null,
    createdAt: new Date(file.createdAt),
    createdBy: null,
    notes: null,
    tenantId: null,
  } as unknown as Baseline;
}

function fmtSigned(n: number, digits: number, unit: string): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${unit}`;
}

function describeRegression(baseline: GateBaselineFile, report: RegressionReport): string {
  const parts = [
    `pass rate ${fmtSigned(report.passRateDeltaPercent, 1, 'pp')}`,
    `avg score ${fmtSigned(report.avgScoreDelta, 2, '')}`,
  ];
  if (report.latencyDeltaMs !== 0) parts.push(`latency ${fmtSigned(report.latencyDeltaMs, 0, 'ms')}`);
  const regressedDims = Object.entries(report.dimensionDeltas)
    .filter(([, d]) => d.severity !== 'none')
    .map(([id, d]) => `${id} ${d.old.toFixed(1)}→${d.new.toFixed(1)}`);
  const dimNote = regressedDims.length > 0 ? `; regressed dimensions: ${regressedDims.join(', ')}` : '';
  return `Regression vs baseline "${baseline.name}" (severity ${report.severity}): ${parts.join(', ')}${dimNote}.`;
}

/** Decide the gate for a finished run. Pure — the caller handles IO and exit. */
export function evaluateGate(
  baseline: GateBaselineFile | null,
  snapshot: ScenarioMetricsSnapshot,
  opts: GateOptions,
): GateDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let report: RegressionReport | null = null;
  let judgeDrift = false;

  if (snapshot.totalRuns === 0) {
    reasons.push('No evaluation results produced — nothing to gate on; treating as a failure.');
  } else {
    if (opts.minPassRate != null) {
      const actualPct = snapshot.passRate * 100;
      if (actualPct < opts.minPassRate) {
        reasons.push(
          `Pass rate ${actualPct.toFixed(1)}% is below the required minimum ${opts.minPassRate}%.`,
        );
      }
    }

    if (baseline) {
      judgeDrift =
        baseline.judgeConfigHash != null &&
        opts.currentJudgeConfigHash != null &&
        baseline.judgeConfigHash !== opts.currentJudgeConfigHash;
      if (judgeDrift) {
        const msg =
          `Judge configuration changed since baseline "${baseline.name}" was recorded ` +
          `(${baseline.judgeConfigHash} → ${opts.currentJudgeConfigHash}) — scores may not be comparable. ` +
          `Re-bless with --update-baseline after intentional judge changes.`;
        if (opts.failOnDrift) reasons.push(msg);
        else warnings.push(msg);
      }

      report = detectRegression(toPrismaBaseline(baseline), snapshot);
      if (report.severity !== 'NONE') {
        if (SEVERITY_RANK[report.severity] >= FAIL_ON_RANK[opts.failOn]) {
          reasons.push(describeRegression(baseline, report));
        } else {
          warnings.push(
            `Regression severity ${report.severity} detected but below the --fail-on threshold (${opts.failOn}) — not failing the gate.`,
          );
        }
      }
    }
  }

  const passed = reasons.length === 0;
  return {
    passed,
    exitCode: passed ? 0 : EXIT_GATE_FAILED,
    reasons,
    warnings,
    severity: report?.severity ?? null,
    report,
    judgeDrift,
  };
}
