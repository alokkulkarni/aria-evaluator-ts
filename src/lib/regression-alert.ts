// src/lib/regression-alert.ts
// Pure decision + message building for post-run regression alerts.
//
// The run executor compares recent metrics against the scenario's latest
// baseline after each portal run (same query as GET /api/regression/status)
// and, when the regression severity warrants it, pushes a regression_detected
// notification through the notifier. This module holds the testable parts:
// which severities alert, and what the alert says.

import type { RegressionReport } from './metrics.js';
import type { NotifyEvent } from './notifier.js';

/** Alert on MEDIUM/CRITICAL only — LOW (latency-only) would be noise. */
export function shouldAlertRegression(report: RegressionReport | null): boolean {
  return report != null && (report.severity === 'MEDIUM' || report.severity === 'CRITICAL');
}

function fmtSigned(n: number, digits: number, unit: string): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${unit}`;
}

export function buildRegressionAlertEvent(params: {
  scenarioName: string;
  baselineName: string;
  runId: string;
  report: RegressionReport;
  judgeDriftDetected: boolean;
}): NotifyEvent {
  const { scenarioName, baselineName, runId, report, judgeDriftDetected } = params;

  const regressedDims = Object.entries(report.dimensionDeltas)
    .filter(([, d]) => d.severity !== 'none')
    .map(([id, d]) => `${id} ${d.old.toFixed(1)}→${d.new.toFixed(1)}`);

  const parts = [
    `pass rate ${fmtSigned(report.passRateDeltaPercent, 1, 'pp')}`,
    `avg score ${fmtSigned(report.avgScoreDelta, 2, '')}`,
  ];
  if (regressedDims.length > 0) parts.push(`regressed dimensions: ${regressedDims.join(', ')}`);

  let body = `vs baseline "${baselineName}" over the last ${report.recentRunCount} run(s): ${parts.join('; ')}.`;
  if (judgeDriftDetected) {
    body += ' Note: the judge committee changed since the baseline was recorded — scores may not be comparable; re-create the baseline after intentional judge changes.';
  }

  return {
    type: 'regression_detected',
    severity: report.severity === 'CRITICAL' ? 'critical' : 'warning',
    title: `Regression detected: ${scenarioName} (${report.severity})`,
    body,
    runId,
    scenarioName,
    data: {
      baselineName,
      severity: report.severity,
      passRateDeltaPercent: report.passRateDeltaPercent,
      avgScoreDelta: report.avgScoreDelta,
      judgeDrift: judgeDriftDetected,
    },
  };
}
