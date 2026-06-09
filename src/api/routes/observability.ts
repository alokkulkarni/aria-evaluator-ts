import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { percentile, TOKEN_ESTIMATOR_VERSION } from '../../lib/observability.js';
import { estimateCost, PRICING_VERSION, getModelPrice } from '../../lib/model-pricing.js';
import { getScheduleExecutorStatus } from '../../jobs/schedule-executor.js';

export const observabilityRouter = Router();

const apiStartedAtMs = Date.now();

function parseHours(raw: unknown): number | null {
  // Array (e.g. ?hours=1&hours=2) is a client error — reject it
  if (Array.isArray(raw)) return null;
  // Omitted entirely → default to 24
  if (raw === undefined) return 24;
  // Any other non-string → reject
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1 || value > 168) return null;
  return value;
}

function round(value: number | null, digits = 2): number | null {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

observabilityRouter.get('/health', async (_req, res) => {
  let dbHealthy = true;
  let dbError: string | null = null;

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    dbHealthy = false;
    dbError = (err as Error).message;
  }

  let queuedJobs = 0;
  let runningJobs = 0;
  let failedJobs24h = 0;

  if (dbHealthy) {
    const last24h = new Date(Date.now() - (24 * 60 * 60 * 1000));
    [queuedJobs, runningJobs, failedJobs24h] = await Promise.all([
      prisma.job.count({ where: { status: 'queued' } }),
      prisma.job.count({ where: { status: 'running' } }),
      prisma.job.count({ where: { status: 'failed', completedAt: { gte: last24h } } }),
    ]);
  }

  const memory = process.memoryUsage();
  const schedulerStatus = getScheduleExecutorStatus();
  
  const payload = {
    status: dbHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      healthy: dbHealthy,
      error: dbError,
    },
    jobs: {
      queued: queuedJobs,
      running: runningJobs,
      failedLast24h: failedJobs24h,
    },
    scheduler: {
      running: schedulerStatus.isRunning,
      schedulesActive: schedulerStatus.schedulesActive,
      pollIntervalMs: schedulerStatus.pollIntervalMs,
      lastPollAt: schedulerStatus.lastPollAt?.toISOString() ?? null,
      nextPollAt: schedulerStatus.nextPollAt.toISOString(),
    },
    process: {
      rssMb: round(memory.rss / (1024 * 1024), 1),
      heapUsedMb: round(memory.heapUsed / (1024 * 1024), 1),
      startedAt: new Date(apiStartedAtMs).toISOString(),
    },
  };

  if (!dbHealthy) {
    return res.status(503).json(payload);
  }
  return res.json(payload);
});

observabilityRouter.get('/metrics', async (req, res) => {
  const hours = parseHours(req.query['hours']);
  if (hours == null) {
    return res.status(400).json({ error: 'hours must be an integer between 1 and 168' });
  }

  const since = new Date(Date.now() - (hours * 60 * 60 * 1000));
  const telemetry = await prisma.runTelemetry.findMany({
    where: {
      createdAt: { gte: since },
      run: { NOT: { status: 'deleted' } },
    },
    select: {
      provider: true,
      channel: true,
      status: true,
      latencyMs: true,
      tokenInputEstimate: true,
      tokenOutputEstimate: true,
      tokenTotalEstimate: true,
      failureClass: true,
      attackCategory: true,
      run: {
        select: {
          evalResult: {
            select: {
              judgeTokenInputEstimate: true,
              judgeTokenOutputEstimate: true,
              judgeTokenTotalEstimate: true,
              judgeEstimatedCostUsd: true,
              judgeModel: true,
            },
          },
        },
      },
    },
  });

  const totalRuns = telemetry.length;
  const completedRuns = telemetry.filter((row) => row.status === 'completed').length;
  const failedRuns = telemetry.filter((row) => row.status === 'failed').length;
  const failureRatePercent = totalRuns > 0 ? (failedRuns / totalRuns) * 100 : null;

  const latencies = telemetry
    .map((row) => row.latencyMs)
    .filter((value): value is number => typeof value === 'number');
  const avgLatencyMs = latencies.length > 0
    ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
    : null;
  const p95LatencyMs = percentile(latencies, 95);

  const tokenInputTotal = telemetry.reduce((sum, row) => sum + (row.tokenInputEstimate ?? 0), 0);
  const tokenOutputTotal = telemetry.reduce((sum, row) => sum + (row.tokenOutputEstimate ?? 0), 0);
  const tokenTotal = telemetry.reduce((sum, row) => sum + (row.tokenTotalEstimate ?? 0), 0);
  const judgeTokenInputTotal = telemetry.reduce((sum, row) => sum + (row.run.evalResult?.judgeTokenInputEstimate ?? 0), 0);
  const judgeTokenOutputTotal = telemetry.reduce((sum, row) => sum + (row.run.evalResult?.judgeTokenOutputEstimate ?? 0), 0);
  const judgeTokenTotal = telemetry.reduce((sum, row) => sum + (row.run.evalResult?.judgeTokenTotalEstimate ?? 0), 0);

  // Aggregate judge costs — use stored cost if available, else estimate from tokens
  let judgeCostTotal = 0;
  let judgeCostKnownCount = 0;
  let judgeCostUnknownCount = 0;
  for (const row of telemetry) {
    const er = row.run.evalResult;
    if (!er) continue;
    if (er.judgeEstimatedCostUsd != null) {
      judgeCostTotal += er.judgeEstimatedCostUsd;
      judgeCostKnownCount++;
    } else if (er.judgeModel && er.judgeTokenInputEstimate != null) {
      const cost = estimateCost(er.judgeModel, er.judgeTokenInputEstimate, er.judgeTokenOutputEstimate);
      if (cost) {
        judgeCostTotal += cost.costUsd;
        judgeCostKnownCount++;
      } else {
        judgeCostUnknownCount++;
      }
    } else {
      judgeCostUnknownCount++;
    }
  }

  const providerBuckets = new Map<string, {
    runCount: number;
    completedRuns: number;
    failedRuns: number;
    latencyTotal: number;
    latencyCount: number;
    tokenTotal: number;
  }>();
  const failureBuckets = new Map<string, number>();
  const attackBuckets = new Map<string, {
    count: number;
    avgConfidence: number;
    severityBuckets: Map<string, number>;
  }>();

  for (const row of telemetry) {
    const provider = row.provider || 'unknown';
    const bucket = providerBuckets.get(provider) ?? {
      runCount: 0,
      completedRuns: 0,
      failedRuns: 0,
      latencyTotal: 0,
      latencyCount: 0,
      tokenTotal: 0,
    };
    bucket.runCount += 1;
    if (row.status === 'completed') bucket.completedRuns += 1;
    if (row.status === 'failed') bucket.failedRuns += 1;
    if (typeof row.latencyMs === 'number') {
      bucket.latencyTotal += row.latencyMs;
      bucket.latencyCount += 1;
    }
    bucket.tokenTotal += row.tokenTotalEstimate ?? 0;
    providerBuckets.set(provider, bucket);

    if (row.status === 'failed') {
      const failureClass = row.failureClass ?? 'unknown';
      failureBuckets.set(failureClass, (failureBuckets.get(failureClass) ?? 0) + 1);
    }

    // Aggregate security attacks by category
    if (row.attackCategory) {
      const existing = attackBuckets.get(row.attackCategory) ?? {
        count: 0,
        avgConfidence: 0,
        severityBuckets: new Map<string, number>(),
      };
      existing.count += 1;
      attackBuckets.set(row.attackCategory, existing);
    }
  }

  const providers = Array.from(providerBuckets.entries())
    .map(([provider, bucket]) => ({
      provider,
      runCount: bucket.runCount,
      completedRuns: bucket.completedRuns,
      failedRuns: bucket.failedRuns,
      failureRatePercent: bucket.runCount > 0 ? round((bucket.failedRuns / bucket.runCount) * 100) : 0,
      avgLatencyMs: bucket.latencyCount > 0 ? round(bucket.latencyTotal / bucket.latencyCount) : null,
      tokenTotalEstimate: bucket.tokenTotal,
      avgTokensPerRunEstimate: bucket.runCount > 0 ? round(bucket.tokenTotal / bucket.runCount) : null,
    }))
    .sort((a, b) => b.runCount - a.runCount);

  const failures = Array.from(failureBuckets.entries())
    .map(([failureClass, count]) => ({ failureClass, count }))
    .sort((a, b) => b.count - a.count);

  // Get schedule statistics
  const [activeSchedules, pausedSchedules, archivedSchedules] = await Promise.all([
    prisma.schedule.count({ where: { status: 'active', deletedAt: null } }),
    prisma.schedule.count({ where: { status: 'paused', deletedAt: null } }),
    prisma.schedule.count({ where: { status: 'archived', deletedAt: null } }),
  ]);

  const last24h = new Date(Date.now() - (24 * 60 * 60 * 1000));
  const scheduledRunsLast24h = await prisma.scheduleRun.count({
    where: { triggeredAt: { gte: last24h } },
  });
  const failedScheduledRunsLast24h = await prisma.scheduleRun.count({
    where: {
      triggeredAt: { gte: last24h },
      status: 'failed',
    },
  });

  const attacks = Array.from(attackBuckets.entries())
    .map(([category, bucket]) => ({
      category,
      count: bucket.count,
      percentOfRuns: totalRuns > 0 ? round((bucket.count / totalRuns) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  return res.json({
    window: {
      hours,
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
    totals: {
      totalRuns,
      completedRuns,
      failedRuns,
      failureRatePercent: round(failureRatePercent),
      avgLatencyMs: round(avgLatencyMs),
      p95LatencyMs: round(p95LatencyMs),
      tokenInputTotalEstimate: tokenInputTotal,
      tokenOutputTotalEstimate: tokenOutputTotal,
      tokenTotalEstimate: tokenTotal + judgeTokenTotal,
      scenarioTokenTotalEstimate: tokenTotal,
      judgeTokenInputTotalEstimate: judgeTokenInputTotal,
      judgeTokenOutputTotalEstimate: judgeTokenOutputTotal,
      judgeTokenTotalEstimate: judgeTokenTotal,
      avgTokensPerRunEstimate: totalRuns > 0 ? round((tokenTotal + judgeTokenTotal) / totalRuns) : null,
      avgScenarioTokensPerRunEstimate: totalRuns > 0 ? round(tokenTotal / totalRuns) : null,
      avgJudgeTokensPerRunEstimate: totalRuns > 0 ? round(judgeTokenTotal / totalRuns) : null,
      judgeEstimatedCostUsd: round(judgeCostTotal, 4),
      avgJudgeCostPerRunUsd: judgeCostKnownCount > 0 ? round(judgeCostTotal / judgeCostKnownCount, 6) : null,
      judgeCostKnownCount,
      judgeCostUnknownCount,
    },
    providers,
    failures,
    schedules: {
      activeCount: activeSchedules,
      pausedCount: pausedSchedules,
      archivedCount: archivedSchedules,
      totalRunsLast24h: scheduledRunsLast24h,
      failedRunsLast24h: failedScheduledRunsLast24h,
      failureRateLast24h: scheduledRunsLast24h > 0 ? round((failedScheduledRunsLast24h / scheduledRunsLast24h) * 100) : 0,
    },
    attacks,
    tokenEstimator: {
      version: TOKEN_ESTIMATOR_VERSION,
      method: 'chars_div_4_estimate',
      estimated: true,
    },
    costEstimator: {
      version: PRICING_VERSION,
      method: 'model_token_pricing',
    },
  });
});

// ─── Quality Trends ───────────────────────────────────────────────────────────
// GET /api/metrics/trends?days=30&bucket=day
// Returns time-series of quality scores, pass rates, costs, and token usage.

function parseDays(raw: unknown): number | null {
  if (Array.isArray(raw)) return null;
  if (raw === undefined) return 30;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1 || value > 90) return null;
  return value;
}

observabilityRouter.get('/metrics/trends', async (req, res) => {
  const days = parseDays(req.query['days']);
  if (days == null) {
    return res.status(400).json({ error: 'days must be an integer between 1 and 90' });
  }

  const bucket = req.query['bucket'] === 'hour' ? 'hour' : 'day';
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Fetch runs with eval results and telemetry in the time window
  const runs = await prisma.run.findMany({
    where: {
      NOT: { status: 'deleted' },
      completedAt: { gte: since },
    },
    select: {
      id: true,
      status: true,
      completedAt: true,
      evalResult: {
        select: {
          overallScore: true,
          passed: true,
          judgeEstimatedCostUsd: true,
          judgeModel: true,
          judgeTokenInputEstimate: true,
          judgeTokenOutputEstimate: true,
          judgeTokenTotalEstimate: true,
        },
      },
      telemetry: {
        select: {
          latencyMs: true,
          tokenTotalEstimate: true,
        },
      },
    },
    orderBy: { completedAt: 'asc' },
  });

  // Bucket runs by date
  const buckets = new Map<string, {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    evaluatedRuns: number;
    evalPassedRuns: number;
    scoreSum: number;
    scoreCount: number;
    latencySum: number;
    latencyCount: number;
    tokenTotal: number;
    costTotal: number;
  }>();

  for (const run of runs) {
    if (!run.completedAt) continue;
    const dt = run.completedAt;
    const key = bucket === 'hour'
      ? `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}T${String(dt.getUTCHours()).padStart(2, '0')}:00Z`
      : `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;

    const b = buckets.get(key) ?? {
      totalRuns: 0, completedRuns: 0, failedRuns: 0,
      evaluatedRuns: 0, evalPassedRuns: 0,
      scoreSum: 0, scoreCount: 0,
      latencySum: 0, latencyCount: 0,
      tokenTotal: 0, costTotal: 0,
    };

    b.totalRuns++;
    if (run.status === 'completed') b.completedRuns++;
    if (run.status === 'failed') b.failedRuns++;

    if (run.evalResult) {
      b.evaluatedRuns++;
      if (run.evalResult.passed) b.evalPassedRuns++;
      if (run.evalResult.overallScore > 0) {
        b.scoreSum += run.evalResult.overallScore;
        b.scoreCount++;
      }
      // Cost: use stored if available, else estimate
      if (run.evalResult.judgeEstimatedCostUsd != null) {
        b.costTotal += run.evalResult.judgeEstimatedCostUsd;
      } else if (run.evalResult.judgeModel) {
        const cost = estimateCost(run.evalResult.judgeModel, run.evalResult.judgeTokenInputEstimate, run.evalResult.judgeTokenOutputEstimate);
        if (cost) b.costTotal += cost.costUsd;
      }
    }

    if (run.telemetry) {
      if (typeof run.telemetry.latencyMs === 'number') {
        b.latencySum += run.telemetry.latencyMs;
        b.latencyCount++;
      }
      b.tokenTotal += run.telemetry.tokenTotalEstimate ?? 0;
    }

    buckets.set(key, b);
  }

  const trend = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, b]) => ({
      date,
      totalRuns: b.totalRuns,
      completedRuns: b.completedRuns,
      failedRuns: b.failedRuns,
      executionSuccessRate: b.totalRuns > 0 ? round((b.completedRuns / b.totalRuns) * 100) : null,
      evaluatedRuns: b.evaluatedRuns,
      evalPassRate: b.evaluatedRuns > 0 ? round((b.evalPassedRuns / b.evaluatedRuns) * 100) : null,
      avgScore: b.scoreCount > 0 ? round(b.scoreSum / b.scoreCount, 1) : null,
      avgLatencyMs: b.latencyCount > 0 ? round(b.latencySum / b.latencyCount) : null,
      tokenTotal: b.tokenTotal,
      judgeCostUsd: round(b.costTotal, 4),
    }));

  return res.json({
    window: { days, bucket, since: since.toISOString(), until: new Date().toISOString() },
    trend,
    summary: {
      totalDataPoints: trend.length,
      totalRuns: runs.length,
    },
  });
});

// ─── Dimension Analytics ──────────────────────────────────────────────────────
// GET /api/metrics/dimensions?hours=168
// Returns per-dimension average scores and pass rates across all evaluated runs.

const DIMENSION_PASS_THRESHOLD = 7; // score >= 7 out of 10 = pass

observabilityRouter.get('/metrics/dimensions', async (req, res) => {
  const hours = parseHours(req.query['hours']);
  if (hours == null) {
    return res.status(400).json({ error: 'hours must be an integer between 1 and 168' });
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const evalResults = await prisma.evalResult.findMany({
    where: {
      createdAt: { gte: since },
      run: { NOT: { status: 'deleted' } },
    },
    select: {
      dimensionScores: true,
      scenarioType: true,
    },
  });

  // Aggregate dimension scores
  const dimBuckets = new Map<string, {
    scoreSum: number;
    count: number;
    passCount: number;
    scenarioTypes: Set<string>;
  }>();

  for (const er of evalResults) {
    let parsed: Record<string, { score?: number; justification?: string }>;
    try {
      parsed = JSON.parse(er.dimensionScores);
    } catch {
      continue; // skip malformed JSON
    }

    for (const [dimId, dimData] of Object.entries(parsed)) {
      if (dimData == null || typeof dimData.score !== 'number') continue;

      const bucket = dimBuckets.get(dimId) ?? {
        scoreSum: 0, count: 0, passCount: 0, scenarioTypes: new Set(),
      };

      bucket.scoreSum += dimData.score;
      bucket.count++;
      if (dimData.score >= DIMENSION_PASS_THRESHOLD) bucket.passCount++;
      if (er.scenarioType) bucket.scenarioTypes.add(er.scenarioType);
      dimBuckets.set(dimId, bucket);
    }
  }

  const dimensions = Array.from(dimBuckets.entries())
    .map(([dimension, b]) => ({
      dimension,
      avgScore: round(b.scoreSum / b.count, 1),
      passRate: round((b.passCount / b.count) * 100),
      totalEvals: b.count,
      scenarioTypes: Array.from(b.scenarioTypes),
    }))
    .sort((a, b) => (a.avgScore ?? 0) - (b.avgScore ?? 0)); // weakest first

  const weakest = dimensions.slice(0, 3);
  const strongest = [...dimensions].sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0)).slice(0, 3);

  return res.json({
    window: { hours, since: since.toISOString(), until: new Date().toISOString() },
    passThreshold: DIMENSION_PASS_THRESHOLD,
    totalEvalResults: evalResults.length,
    dimensions,
    insights: {
      weakest: weakest.map((d) => ({ dimension: d.dimension, avgScore: d.avgScore, passRate: d.passRate })),
      strongest: strongest.map((d) => ({ dimension: d.dimension, avgScore: d.avgScore, passRate: d.passRate })),
    },
  });
});
