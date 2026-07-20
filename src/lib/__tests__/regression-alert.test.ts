// Regression alerting — pure-module tests.
//
// After each portal run the executor compares recent metrics against the
// scenario's latest baseline (same query the /regression/status route uses)
// and pushes a regression_detected notification when the severity warrants it.

import { describe, expect, it } from 'vitest';

import { buildRegressionAlertEvent, shouldAlertRegression } from '../regression-alert.js';
import type { RegressionReport } from '../metrics.js';

function report(overrides: Partial<RegressionReport> = {}): RegressionReport {
  return {
    severity: 'MEDIUM',
    passRateDelta: -0.1,
    passRateDeltaPercent: -10,
    avgScoreDelta: -0.8,
    latencyDeltaMs: 0,
    dimensionDeltas: {
      correctness: { old: 8, new: 7.1, delta: -0.9, severity: 'medium' },
      clarity: { old: 8, new: 8, delta: 0, severity: 'none' },
    },
    newDimensions: [],
    deprecatedDimensions: [],
    recentRunCount: 10,
    comparableRunCount: 10,
    ...overrides,
  };
}

describe('shouldAlertRegression', () => {
  it('alerts on MEDIUM and CRITICAL only', () => {
    expect(shouldAlertRegression(report({ severity: 'CRITICAL' }))).toBe(true);
    expect(shouldAlertRegression(report({ severity: 'MEDIUM' }))).toBe(true);
    expect(shouldAlertRegression(report({ severity: 'LOW' }))).toBe(false);
    expect(shouldAlertRegression(report({ severity: 'NONE' }))).toBe(false);
    expect(shouldAlertRegression(null)).toBe(false);
  });
});

describe('buildRegressionAlertEvent', () => {
  const params = {
    scenarioName: 'banking/account_query',
    baselineName: 'nightly',
    runId: 'run-9',
    report: report(),
    judgeDriftDetected: false,
  };

  it('maps severity: CRITICAL → critical, MEDIUM → warning', () => {
    expect(buildRegressionAlertEvent({ ...params, report: report({ severity: 'CRITICAL' }) }).severity).toBe('critical');
    expect(buildRegressionAlertEvent(params).severity).toBe('warning');
  });

  it('carries the deltas and only the regressed dimensions in the body', () => {
    const event = buildRegressionAlertEvent(params);
    expect(event.type).toBe('regression_detected');
    expect(event.runId).toBe('run-9');
    expect(event.scenarioName).toBe('banking/account_query');
    expect(event.title).toContain('banking/account_query');
    expect(event.body).toContain('-10.0pp');
    expect(event.body).toContain('-0.80');
    expect(event.body).toContain('correctness');
    expect(event.body).not.toContain('clarity'); // severity 'none' → not listed
    expect(event.data).toMatchObject({ baselineName: 'nightly', severity: 'MEDIUM' });
  });

  it('appends a judge-drift caveat when the committee changed since the baseline', () => {
    const clean = buildRegressionAlertEvent(params);
    expect(clean.body).not.toMatch(/judge/i);

    const drifted = buildRegressionAlertEvent({ ...params, judgeDriftDetected: true });
    expect(drifted.body).toMatch(/judge.*changed/i);
    expect(drifted.data).toMatchObject({ judgeDrift: true });
  });
});
