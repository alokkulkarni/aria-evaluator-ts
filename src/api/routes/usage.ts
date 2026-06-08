// src/api/routes/usage.ts
// Returns current plan limits and usage stats for the authenticated tenant.

import { Router } from 'express';
import { getUsageLimits } from '../../shared/usage-limits.js';
import { getMonthlyUsageStats } from '../../shared/quota-enforcement.js';

export const usageRouter = Router();

usageRouter.get('/', async (_req, res) => {
  try {
    const limits = getUsageLimits();
    const stats = await getMonthlyUsageStats();

    res.json({
      tier: limits.tier,
      enabled: limits.enabled,
      limits: {
        maxScenariosPerRun: limits.maxScenariosPerRun,
        maxRunsPerMonth: limits.maxRunsPerMonth,
        maxModels: limits.maxModels,
      },
      usage: {
        runsThisMonth: stats.runsThisMonth,
        distinctProviders: stats.distinctProviders,
        distinctProviderCount: stats.distinctProviders.length,
      },
      periodStart: stats.periodStart,
    });
  } catch (err) {
    console.error('[usage] Failed to fetch usage stats:', err);
    res.status(500).json({ error: 'Failed to fetch usage stats' });
  }
});
