// src/lib/scenario-trends.ts
// Pure aggregation for per-scenario score trends. No Prisma imports — callers
// (API routes) query evaluated runs and pass plain rows in, which keeps this
// unit-testable.

export interface ScenarioTrendRow {
  completedAt: Date;
  overallScore: number;
  passed: boolean;
  /** JSON: Record<dimensionId, { score: number, ... }> — malformed JSON is silently skipped. */
  dimensionScores: string | null;
}

export interface ScenarioTrendPoint {
  /** UTC day, formatted YYYY-MM-DD. */
  date: string;
  runs: number;
  /** Fraction of evaluated runs that passed, 0-1 (rounded to 4dp). */
  passRate: number;
  /** Mean overall score, 0-10 (rounded to 2dp). */
  avgScore: number;
  /** Per-dimension mean score for the day (rounded to 2dp). */
  dimensionAvgs: Record<string, number>;
}

export interface ScenarioTrendResult {
  trend: ScenarioTrendPoint[];
  /** Union of dimension ids seen across the window, sorted. */
  dimensions: string[];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function utcDayKey(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Parse a dimensionScores JSON blob into {dimId: score}. Malformed or
 *  non-object JSON, and entries without a numeric score, are silently skipped. */
function parseDimensionScores(raw: string | null): Record<string, number> {
  if (raw == null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const scores: Record<string, number> = {};
  for (const [dimId, dimData] of Object.entries(parsed as Record<string, unknown>)) {
    if (dimData == null || typeof dimData !== 'object') continue;
    const score = (dimData as { score?: unknown }).score;
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;
    scores[dimId] = score;
  }
  return scores;
}

/**
 * Bucket evaluated runs of a single scenario into UTC-day trend points.
 * Rows completed more than `days` days before `now` are excluded; the caller
 * is expected to have applied the same window in its query, so this is a
 * defensive re-check that also makes the function fully deterministic in tests.
 */
export function bucketScenarioTrend(
  rows: ScenarioTrendRow[],
  days: number,
  now: Date = new Date(),
): ScenarioTrendResult {
  const since = now.getTime() - days * 24 * 60 * 60 * 1000;

  const buckets = new Map<string, {
    runs: number;
    passed: number;
    scoreSum: number;
    dimSums: Map<string, { sum: number; count: number }>;
  }>();
  const allDimensions = new Set<string>();

  for (const rowItem of rows) {
    if (rowItem.completedAt.getTime() < since) continue;
    const key = utcDayKey(rowItem.completedAt);

    const bucket = buckets.get(key) ?? {
      runs: 0, passed: 0, scoreSum: 0, dimSums: new Map(),
    };
    bucket.runs++;
    if (rowItem.passed) bucket.passed++;
    bucket.scoreSum += rowItem.overallScore;

    for (const [dimId, score] of Object.entries(parseDimensionScores(rowItem.dimensionScores))) {
      allDimensions.add(dimId);
      const dim = bucket.dimSums.get(dimId) ?? { sum: 0, count: 0 };
      dim.sum += score;
      dim.count++;
      bucket.dimSums.set(dimId, dim);
    }

    buckets.set(key, bucket);
  }

  const trend = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => {
      const dimensionAvgs: Record<string, number> = {};
      for (const [dimId, { sum, count }] of b.dimSums) {
        dimensionAvgs[dimId] = round(sum / count, 2);
      }
      return {
        date,
        runs: b.runs,
        passRate: round(b.passed / b.runs, 4),
        avgScore: round(b.scoreSum / b.runs, 2),
        dimensionAvgs,
      };
    });

  return { trend, dimensions: Array.from(allDimensions).sort() };
}
