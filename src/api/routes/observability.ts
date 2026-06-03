import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { percentile, TOKEN_ESTIMATOR_VERSION } from '../../lib/observability.js';

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
      tokenTotalEstimate: tokenTotal,
      avgTokensPerRunEstimate: totalRuns > 0 ? round(tokenTotal / totalRuns) : null,
    },
    providers,
    failures,
    attacks,
    tokenEstimator: {
      version: TOKEN_ESTIMATOR_VERSION,
      method: 'chars_div_4_estimate',
      estimated: true,
    },
  });
});

