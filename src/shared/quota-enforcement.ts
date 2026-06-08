// src/shared/quota-enforcement.ts
// Shared quota enforcement used by both manual run creation and scheduled runs.

import { prisma } from '../db/client.js';
import { getUsageLimits, getUtcMonthStart } from './usage-limits.js';

export interface QuotaCheckResult {
  allowed: boolean;
  error?: string;
  code?: string;
  limit?: string;
  current?: number;
  maximum?: number;
}

/**
 * Check whether starting a new run is allowed given the current plan limits.
 * Call this before creating/queuing any run — manual or scheduled.
 */
export async function checkRunQuota(scenarioCount: number, provider: string): Promise<QuotaCheckResult> {
  const limits = getUsageLimits();
  if (!limits.enabled) return { allowed: true };

  // 1. Scenarios per run
  if (limits.maxScenariosPerRun >= 0 && scenarioCount > limits.maxScenariosPerRun) {
    return {
      allowed: false,
      error: `Selected ${scenarioCount} scenarios, but your plan allows up to ${limits.maxScenariosPerRun} per run.`,
      code: 'LIMIT_EXCEEDED',
      limit: 'MAX_SCENARIOS_PER_RUN',
      current: scenarioCount,
      maximum: limits.maxScenariosPerRun,
    };
  }

  // 2. Runs per month
  if (limits.maxRunsPerMonth >= 0) {
    const runsThisMonth = await prisma.run.count({
      where: {
        NOT: { status: 'deleted' },
        createdAt: { gte: getUtcMonthStart() },
      },
    });
    if (runsThisMonth >= limits.maxRunsPerMonth) {
      return {
        allowed: false,
        error: `Monthly run limit reached (${runsThisMonth}/${limits.maxRunsPerMonth}). Upgrade your plan to start another run.`,
        code: 'LIMIT_EXCEEDED',
        limit: 'MAX_RUNS_PER_MONTH',
        current: runsThisMonth,
        maximum: limits.maxRunsPerMonth,
      };
    }
  }

  // 3. Distinct models/providers per month
  if (limits.maxModels >= 0) {
    const distinctProviders = await prisma.runTelemetry.findMany({
      where: {
        run: {
          NOT: { status: 'deleted' },
          createdAt: { gte: getUtcMonthStart() },
        },
      },
      select: { provider: true },
      distinct: ['provider'],
    });
    const existingProviders = new Set(distinctProviders.map((r) => r.provider).filter(Boolean));
    // If this run uses a new provider not seen this month, check whether adding it exceeds the limit
    if (!existingProviders.has(provider) && existingProviders.size >= limits.maxModels) {
      return {
        allowed: false,
        error: `Your plan allows up to ${limits.maxModels} distinct AI providers per month. You have already used ${existingProviders.size}: ${[...existingProviders].join(', ')}. Upgrade your plan to use "${provider}".`,
        code: 'LIMIT_EXCEEDED',
        limit: 'MAX_MODELS',
        current: existingProviders.size,
        maximum: limits.maxModels,
      };
    }
  }

  return { allowed: true };
}

/** Return current month usage stats for the /api/usage endpoint. */
export async function getMonthlyUsageStats(): Promise<{
  runsThisMonth: number;
  distinctProviders: string[];
  periodStart: string;
}> {
  const monthStart = getUtcMonthStart();

  const [runCount, providers] = await Promise.all([
    prisma.run.count({
      where: {
        NOT: { status: 'deleted' },
        createdAt: { gte: monthStart },
      },
    }),
    prisma.runTelemetry.findMany({
      where: {
        run: {
          NOT: { status: 'deleted' },
          createdAt: { gte: monthStart },
        },
      },
      select: { provider: true },
      distinct: ['provider'],
    }),
  ]);

  return {
    runsThisMonth: runCount,
    distinctProviders: providers.map((r) => r.provider).filter(Boolean) as string[],
    periodStart: monthStart.toISOString(),
  };
}
