import type { Run, EvalResult, Baseline } from '@prisma/client';

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface DimensionStats {
  avg: number;
  stddev: number;
}

export interface ScenarioMetricsSnapshot {
  totalRuns: number;
  passRate: number;
  avgScore: number;
  avgLatencyMs: number;
  dimensionMetrics: Record<string, DimensionStats>;
}

export interface RegressionReport {
  severity: 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL';
  passRateDelta: number;
  passRateDeltaPercent: number;
  avgScoreDelta: number;
  latencyDeltaMs: number;
  dimensionDeltas: Record<
    string,
    {
      old: number;
      new: number;
      delta: number;
      severity: string;
    }
  >;
  newDimensions: string[];
  deprecatedDimensions: string[];
  recentRunCount: number;
  comparableRunCount: number;
}

// ─── Statistics Helpers ───────────────────────────────────────────────────────

/**
 * Calculate mean and standard deviation for an array of numbers.
 */
export function calculateDimensionStats(scores: number[]): DimensionStats {
  if (scores.length === 0) {
    return { avg: 0, stddev: 0 };
  }

  const mean = scores.reduce((sum, val) => sum + val, 0) / scores.length;
  const variance =
    scores.reduce((sum, val) => sum + (val - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);

  return { avg: mean, stddev };
}

/**
 * Calculate latency in milliseconds from run start to eval result end.
 * Wall time = evalResult.createdAt - run.createdAt.
 */
export function calculateLatency(
  runCreatedAt: Date,
  evalResultCreatedAt: Date
): number {
  return Math.max(0, evalResultCreatedAt.getTime() - runCreatedAt.getTime());
}

// ─── Metrics Computation ──────────────────────────────────────────────────────

export interface EvalResultSnapshot {
  score: number;
  passed: boolean;
  createdAt: Date;
  dimensionScoresJson: string | null;
}

export interface RunMetricsInput {
  run: Run;
  evalResults: EvalResultSnapshot[];
}

/**
 * Compute aggregate metrics for a set of runs with their eval results.
 * Filters to runs created after minCreatedAt (to exclude historical baseline data).
 */
export function computeScenarioMetrics(
  runsWithEvals: RunMetricsInput[],
  dimensionIds: string[],
  minCreatedAt?: Date
): ScenarioMetricsSnapshot {
  // Filter runs by creation time if needed
  let filteredRuns = runsWithEvals;
  if (minCreatedAt) {
    filteredRuns = runsWithEvals.filter(
      (r) => new Date(r.run.createdAt) > minCreatedAt
    );
  }

  if (filteredRuns.length === 0) {
    return {
      totalRuns: 0,
      passRate: 0,
      avgScore: 0,
      avgLatencyMs: 0,
      dimensionMetrics: Object.fromEntries(
        dimensionIds.map((id) => [id, { avg: 0, stddev: 0 }])
      ),
    };
  }

  // Compute pass rate and avg score
  let passCount = 0;
  let totalScore = 0;
  let totalLatency = 0;
  const dimensionScores: Record<string, number[]> = {};

  // Initialize dimension arrays
  for (const dimId of dimensionIds) {
    dimensionScores[dimId] = [];
  }

  // Process each run
  let totalEvals = 0;
  for (const { run, evalResults } of filteredRuns) {
    // For pass rate: count if any eval result passed
    if (evalResults.some((er) => er.passed)) {
      passCount++;
    }

    // Aggregate scores and latency across all eval results
    for (const evalResult of evalResults) {
      totalEvals++;
      totalScore += evalResult.score || 0;
      totalLatency += calculateLatency(run.createdAt, evalResult.createdAt);

      // Extract dimension scores
      if (evalResult.dimensionScoresJson) {
        try {
          const dimScores = JSON.parse(evalResult.dimensionScoresJson) as Record<string, { score: number }>;
          for (const dimId of dimensionIds) {
            if (dimScores[dimId]?.score !== undefined && dimensionScores[dimId]) {
              dimensionScores[dimId]!.push(dimScores[dimId].score);
            }
          }
        } catch {
          // Silently skip malformed JSON
        }
      }
    }
  }

  // Compute averages
  const avgScore = totalEvals > 0 ? totalScore / totalEvals : 0;
  const avgLatencyMs = totalEvals > 0 ? totalLatency / totalEvals : 0;

  // Compute dimension stats
  const dimensionMetrics: Record<string, DimensionStats> = {};
  for (const dimId of dimensionIds) {
    const scores = dimensionScores[dimId] || [];
    dimensionMetrics[dimId] = calculateDimensionStats(scores);
  }

  return {
    totalRuns: filteredRuns.length,
    passRate: filteredRuns.length > 0 ? passCount / filteredRuns.length : 0,
    avgScore,
    avgLatencyMs: Math.round(avgLatencyMs),
    dimensionMetrics,
  };
}

// ─── Regression Detection ─────────────────────────────────────────────────────

/**
 * Detect regression by comparing recent metrics to baseline.
 * Returns severity classification and delta for each metric.
 */
export function detectRegression(
  baseline: Baseline,
  recentMetrics: ScenarioMetricsSnapshot
): RegressionReport {
  // Parse baseline thresholds
  const defaultThresholds = {
    passRateDrop: 5, // percentage points
    scoreDrop: 0.5, // absolute score points
    latencyIncrease: 20, // percentage
  };

  let thresholds = defaultThresholds;
  if (baseline.thresholdOverridesJson) {
    try {
      const overrides = JSON.parse(baseline.thresholdOverridesJson);
      thresholds = { ...defaultThresholds, ...overrides };
    } catch {
      // Use defaults
    }
  }

  // Parse baseline dimension metrics and IDs
  let baselineDimIds: string[] = [];
  const baselineDimMetrics: Record<string, DimensionStats> = {};
  try {
    baselineDimIds = JSON.parse(baseline.dimensionIdsJson);
    const parsed = JSON.parse(baseline.dimensionMetricsJson);
    Object.assign(baselineDimMetrics, parsed);
  } catch {
    // Malformed baseline
  }

  // Compute deltas
  const passRateDelta = recentMetrics.passRate - baseline.passRate;
  const passRateDeltaPercent = passRateDelta * 100;
  const avgScoreDelta = recentMetrics.avgScore - baseline.avgScore;
  const latencyDeltaPercent =
    baseline.avgLatencyMs > 0
      ? ((recentMetrics.avgLatencyMs - baseline.avgLatencyMs) /
          baseline.avgLatencyMs) *
        100
      : 0;
  const latencyDeltaMs =
    recentMetrics.avgLatencyMs - baseline.avgLatencyMs;

  // Classify severity
  let severity: 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL' = 'NONE';

  // Pass rate drop is most critical (e.g., -5 percentage points)
  // Note: passRateDeltaPercent is already in percentage (e.g., -5), so compare directly to -threshold
  if (passRateDeltaPercent <= -thresholds.passRateDrop) {
    severity = 'CRITICAL';
  }
  // Score drop is medium
  else if (avgScoreDelta <= -thresholds.scoreDrop) {
    severity = 'MEDIUM';
  }
  // Latency increase is low
  else if (latencyDeltaPercent >= thresholds.latencyIncrease) {
    severity = 'LOW';
  }

  // Compute dimension deltas
  const dimensionDeltas: Record<
    string,
    { old: number; new: number; delta: number; severity: string }
  > = {};

  const newDimensions: string[] = [];
  const deprecatedDimensions: string[] = [];

  // Check each dimension in recent metrics
  for (const dimId of Object.keys(recentMetrics.dimensionMetrics)) {
    if (!baselineDimIds.includes(dimId)) {
      newDimensions.push(dimId);
    } else {
      const baselineStat = baselineDimMetrics[dimId] || { avg: 0, stddev: 0 };
      const recentStat = recentMetrics.dimensionMetrics[dimId];
      if (!recentStat) continue;

      const delta = recentStat.avg - baselineStat.avg;

      let dimSeverity = 'none';
      if (Math.abs(delta) > thresholds.scoreDrop) {
        dimSeverity = 'medium';
        if (severity === 'NONE') {
          severity = 'MEDIUM';
        }
      }

      dimensionDeltas[dimId] = {
        old: baselineStat.avg,
        new: recentStat.avg,
        delta,
        severity: dimSeverity,
      };
    }
  }

  // Check for deprecated dimensions
  for (const dimId of baselineDimIds) {
    if (!Object.keys(recentMetrics.dimensionMetrics).includes(dimId)) {
      deprecatedDimensions.push(dimId);
    }
  }

  return {
    severity,
    passRateDelta,
    passRateDeltaPercent,
    avgScoreDelta,
    latencyDeltaMs,
    dimensionDeltas,
    newDimensions,
    deprecatedDimensions,
    recentRunCount: recentMetrics.totalRuns,
    comparableRunCount: recentMetrics.totalRuns,
  };
}
