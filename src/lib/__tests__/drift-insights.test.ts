import { describe, expect, it } from 'vitest';

import { explainDrift } from '../drift-insights.js';
import type { RegressionReport } from '../metrics.js';
import type { JudgeDriftReport } from '../judge-drift.js';

function report(overrides: Partial<RegressionReport> = {}): RegressionReport {
  return {
    severity: 'NONE',
    passRateDelta: 0,
    passRateDeltaPercent: 0,
    avgScoreDelta: 0,
    latencyDeltaMs: 0,
    dimensionDeltas: {},
    newDimensions: [],
    deprecatedDimensions: [],
    recentRunCount: 20,
    comparableRunCount: 20,
    ...overrides,
  };
}

describe('explainDrift', () => {
  it('handles a null regression report (no recent runs)', () => {
    const insights = explainDrift(null);
    expect(insights.detected).toBe(false);
    expect(insights.severity).toBe('NONE');
    expect(insights.dimensions).toEqual([]);
    expect(insights.suggestions).toEqual([]);
  });

  it('reports no drift when nothing regressed', () => {
    const insights = explainDrift(report());
    expect(insights.detected).toBe(false);
    expect(insights.summary).toMatch(/no material drift/i);
  });

  it('flags a regressed dimension with a reason + tailored suggestion', () => {
    const insights = explainDrift(
      report({
        severity: 'MEDIUM',
        avgScoreDelta: -0.8,
        dimensionDeltas: {
          correctness: { old: 8.5, new: 7.0, delta: -1.5, severity: 'medium' },
          clarity: { old: 8.0, new: 8.1, delta: 0.1, severity: 'none' }, // improvement — ignored
        },
      }),
    );
    expect(insights.detected).toBe(true);
    expect(insights.dimensions).toHaveLength(1);
    const dim = insights.dimensions[0]!;
    expect(dim.dimensionId).toBe('correctness');
    expect(dim.reason).toContain('dropped 1.5 points');
    expect(dim.suggestion).toMatch(/grounding|hallucination/i);
    // hallucination-specific guidance is surfaced at the top level too
    expect(insights.suggestions.some((s) => /grounding|hallucination/i.test(s))).toBe(true);
  });

  it('orders dimensions by biggest drop first', () => {
    const insights = explainDrift(
      report({
        severity: 'MEDIUM',
        dimensionDeltas: {
          correctness: { old: 8, new: 7.2, delta: -0.8, severity: 'medium' },
          bias_and_fairness: { old: 9, new: 6.5, delta: -2.5, severity: 'medium' },
        },
      }),
    );
    expect(insights.dimensions.map((d) => d.dimensionId)).toEqual([
      'bias_and_fairness',
      'correctness',
    ]);
  });

  it('adds a pass-rate blocker suggestion when the pass rate falls', () => {
    const insights = explainDrift(
      report({ severity: 'CRITICAL', passRateDelta: -0.1, passRateDeltaPercent: -10 }),
    );
    expect(insights.detected).toBe(true);
    expect(insights.suggestions[0]).toMatch(/pass rate fell 10\.0 points/i);
    expect(insights.suggestions[0]).toMatch(/release blocker/i);
  });

  it('surfaces a judge-config-change caveat when the committee drifted', () => {
    const judgeDrift: JudgeDriftReport = {
      detected: true,
      baselineHash: 'abc',
      mismatchedHashes: ['def'],
    };
    const insights = explainDrift(report(), judgeDrift);
    expect(insights.judgeConfigChanged).toBe(true);
    expect(insights.caveats[0]).toMatch(/judge committee configuration changed/i);
  });
});
