// CI regression gate — pure-module tests.
//
// The gate turns a finished CLI run (EvalResult[] in memory) into an exit-code
// decision for CI: an absolute pass-rate floor, and/or a comparison against a
// file-based baseline that is bridged into the EXISTING detectRegression()
// from src/lib/metrics.ts (no forked regression logic).

import { describe, expect, it } from 'vitest';

import {
  EXIT_GATE_FAILED,
  GATE_BASELINE_VERSION,
  buildGateBaseline,
  evaluateGate,
  parseGateBaselineFile,
  snapshotFromResults,
  type GateBaselineFile,
} from '../regression-gate.js';
import type { ScenarioMetricsSnapshot } from '../metrics.js';
import type { EvalResult } from '../../types/evaluation.js';
import type { Transcript } from '../../types/transcript.js';

function result(
  overallScore: number,
  passed: boolean,
  dims: Record<string, number> = {},
  judgeConfigHash = 'hash-a',
): EvalResult {
  return {
    runId: 'r',
    scenarioName: 's',
    overallScore,
    passed,
    dimensionScores: Object.fromEntries(
      Object.entries(dims).map(([id, score]) => [id, { score, justification: 'j' }]),
    ),
    summary: '',
    judgeModel: 'm',
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    judgeConfigHash,
  } as EvalResult;
}

function transcript(durationMs?: number): Transcript {
  const startedAt = '2026-01-01T00:00:00.000Z';
  return {
    id: 't',
    scenarioName: 's',
    channel: 'chat',
    startedAt,
    ...(durationMs != null
      ? { completedAt: new Date(Date.parse(startedAt) + durationMs).toISOString() }
      : {}),
    turns: [],
    escalated: false,
  } as unknown as Transcript;
}

function baselineOf(overrides: Partial<GateBaselineFile> = {}): GateBaselineFile {
  return {
    version: GATE_BASELINE_VERSION,
    name: 'ci-baseline',
    createdAt: '2026-01-01T00:00:00.000Z',
    judgeConfigHash: 'hash-a',
    totalRuns: 5,
    passRate: 0.9,
    avgScore: 8,
    avgLatencyMs: 1000,
    dimensionIds: ['correctness'],
    dimensionMetrics: { correctness: { avg: 8, stddev: 0.5 } },
    ...overrides,
  };
}

function snap(overrides: Partial<ScenarioMetricsSnapshot> = {}): ScenarioMetricsSnapshot {
  return {
    totalRuns: 5,
    passRate: 0.9,
    avgScore: 8,
    avgLatencyMs: 1000,
    dimensionMetrics: { correctness: { avg: 8, stddev: 0.5 } },
    ...overrides,
  };
}

const gate = { failOn: 'medium' as const, currentJudgeConfigHash: 'hash-a' };

describe('snapshotFromResults', () => {
  it('computes pass rate, average score, and dimension stats from eval results', () => {
    const s = snapshotFromResults(
      [result(8, true, { correctness: 8, clarity: 6 }), result(4, false, { correctness: 4 })],
      [],
    );
    expect(s.totalRuns).toBe(2);
    expect(s.passRate).toBe(0.5);
    expect(s.avgScore).toBe(6);
    expect(s.dimensionMetrics['correctness']).toEqual({ avg: 6, stddev: 2 });
    expect(s.dimensionMetrics['clarity']).toEqual({ avg: 6, stddev: 0 });
  });

  it('averages conversation latency from transcripts with completedAt', () => {
    const s = snapshotFromResults(
      [result(8, true)],
      [transcript(1000), transcript(3000), transcript()], // third has no completedAt → ignored
    );
    expect(s.avgLatencyMs).toBe(2000);
  });

  it('returns zeroed metrics for an empty run', () => {
    const s = snapshotFromResults([], []);
    expect(s.totalRuns).toBe(0);
    expect(s.passRate).toBe(0);
    expect(s.avgScore).toBe(0);
  });
});

describe('baseline file round-trip', () => {
  it('buildGateBaseline captures the run and survives parse round-trip', () => {
    const built = buildGateBaseline(
      [result(8, true, { correctness: 8 }), result(6, true, { correctness: 6 })],
      [transcript(2000)],
      { name: 'nightly' },
    );
    expect(built.version).toBe(GATE_BASELINE_VERSION);
    expect(built.name).toBe('nightly');
    expect(built.judgeConfigHash).toBe('hash-a'); // lifted from the eval results
    expect(built.passRate).toBe(1);
    expect(built.avgScore).toBe(7);
    expect(built.dimensionIds).toContain('correctness');

    const reparsed = parseGateBaselineFile(JSON.stringify(built));
    expect(reparsed).toEqual(built);
  });

  it('parseGateBaselineFile rejects malformed input with actionable errors', () => {
    expect(() => parseGateBaselineFile('not json')).toThrow(/JSON/i);
    expect(() => parseGateBaselineFile(JSON.stringify({ version: 99 }))).toThrow(/version/i);
    const missingField = { ...baselineOf() } as Record<string, unknown>;
    delete missingField['passRate'];
    expect(() => parseGateBaselineFile(JSON.stringify(missingField))).toThrow(/passRate/);
  });
});

describe('evaluateGate — baseline comparison', () => {
  it('passes when metrics are within thresholds', () => {
    const d = evaluateGate(baselineOf(), snap(), gate);
    expect(d.passed).toBe(true);
    expect(d.exitCode).toBe(0);
    expect(d.severity).toBe('NONE');
  });

  it('fails on a pass-rate drop beyond the threshold (CRITICAL)', () => {
    const d = evaluateGate(baselineOf(), snap({ passRate: 0.8 }), gate); // −10pp > 5pp default
    expect(d.passed).toBe(false);
    expect(d.exitCode).toBe(EXIT_GATE_FAILED);
    expect(d.severity).toBe('CRITICAL');
    expect(d.reasons.join(' ')).toMatch(/pass rate/i);
  });

  it('fails on an average-score drop at --fail-on medium, passes at critical', () => {
    const dropped = snap({ avgScore: 7.2, dimensionMetrics: { correctness: { avg: 8, stddev: 0.5 } } });
    const atMedium = evaluateGate(baselineOf(), dropped, gate);
    expect(atMedium.passed).toBe(false);
    expect(atMedium.severity).toBe('MEDIUM');

    const atCritical = evaluateGate(baselineOf(), dropped, { ...gate, failOn: 'critical' });
    expect(atCritical.passed).toBe(true);
    expect(atCritical.warnings.join(' ')).toMatch(/MEDIUM/); // surfaced, just not fatal
  });

  it('treats latency-only regression as LOW: passes by default, fails at --fail-on low', () => {
    const slower = snap({ avgLatencyMs: 1300 }); // +30% > 20% default
    expect(evaluateGate(baselineOf(), slower, gate).passed).toBe(true);
    const strict = evaluateGate(baselineOf(), slower, { ...gate, failOn: 'low' });
    expect(strict.passed).toBe(false);
    expect(strict.severity).toBe('LOW');
  });

  it('fails on a per-dimension regression even when the overall average holds', () => {
    const dimDrop = snap({ dimensionMetrics: { correctness: { avg: 7.2, stddev: 0.5 } } });
    const d = evaluateGate(baselineOf(), dimDrop, gate);
    expect(d.passed).toBe(false);
    expect(d.reasons.join(' ')).toMatch(/correctness/);
  });
});

describe('evaluateGate — floor, drift, empty runs', () => {
  it('enforces --min-pass-rate without a baseline', () => {
    const low = snap({ passRate: 0.8 });
    const fail = evaluateGate(null, low, { ...gate, minPassRate: 90 });
    expect(fail.passed).toBe(false);
    expect(fail.exitCode).toBe(EXIT_GATE_FAILED);
    expect(fail.reasons.join(' ')).toMatch(/pass rate/i);

    expect(evaluateGate(null, low, { ...gate, minPassRate: 75 }).passed).toBe(true);
  });

  it('flags judge drift as a warning by default and as a failure with failOnDrift', () => {
    const drifted = { ...gate, currentJudgeConfigHash: 'hash-b' };
    const warned = evaluateGate(baselineOf(), snap(), drifted);
    expect(warned.judgeDrift).toBe(true);
    expect(warned.passed).toBe(true);
    expect(warned.warnings.join(' ')).toMatch(/judge/i);

    const fatal = evaluateGate(baselineOf(), snap(), { ...drifted, failOnDrift: true });
    expect(fatal.passed).toBe(false);
    expect(fatal.exitCode).toBe(EXIT_GATE_FAILED);
  });

  it('fails when the gated run produced no evaluation results', () => {
    const d = evaluateGate(null, snap({ totalRuns: 0 }), { ...gate, minPassRate: 50 });
    expect(d.passed).toBe(false);
    expect(d.reasons.join(' ')).toMatch(/no evaluation results/i);
  });

  it('combines floor and baseline failures into one decision', () => {
    const bad = snap({ passRate: 0.8 });
    const d = evaluateGate(baselineOf(), bad, { ...gate, minPassRate: 90 });
    expect(d.passed).toBe(false);
    expect(d.reasons.length).toBeGreaterThanOrEqual(2); // floor + regression
  });
});
