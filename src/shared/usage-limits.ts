export type PricingTier =
  | 'free'
  | 'individual'
  | 'enterprise_starter'
  | 'enterprise_pro'
  | 'enterprise_unlimited';

export interface UsageLimits {
  enabled: boolean;
  tier: PricingTier | null;
  maxScenariosPerRun: number;
  maxRunsPerMonth: number;
}

const DEFAULT_LIMITS_BY_TIER: Record<PricingTier, { maxScenariosPerRun: number; maxRunsPerMonth: number }> = {
  free: { maxScenariosPerRun: 10, maxRunsPerMonth: 5 },
  individual: { maxScenariosPerRun: 30, maxRunsPerMonth: 200 },
  enterprise_starter: { maxScenariosPerRun: 120, maxRunsPerMonth: 900 },
  enterprise_pro: { maxScenariosPerRun: 300, maxRunsPerMonth: 3000 },
  enterprise_unlimited: { maxScenariosPerRun: -1, maxRunsPerMonth: -1 },
};

function parseTier(raw: string | undefined): PricingTier | null {
  const value = raw?.trim().toLowerCase();
  if (
    value === 'free' ||
    value === 'individual' ||
    value === 'enterprise_starter' ||
    value === 'enterprise_pro' ||
    value === 'enterprise_unlimited'
  ) {
    return value;
  }
  return null;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < -1) return null;
  return parsed;
}

export function getUsageLimits(): UsageLimits {
  if (process.env['NODE_ENV'] !== 'production') {
    return {
      enabled: false,
      tier: null,
      maxScenariosPerRun: -1,
      maxRunsPerMonth: -1,
    };
  }

  const tier = parseTier(process.env['ARIA_PRICING_TIER'] ?? process.env['PRICING_TIER']) ?? 'enterprise_starter';
  const tierLimits = DEFAULT_LIMITS_BY_TIER[tier];
  const explicitScenarioLimit = parseLimit(process.env['MAX_SCENARIOS_PER_RUN'] ?? process.env['MAX_SCENARIOS']);
  const explicitRunLimit = parseLimit(process.env['MAX_RUNS_PER_MONTH'] ?? process.env['MAX_RUNS']);

  return {
    enabled: true,
    tier,
    maxScenariosPerRun: explicitScenarioLimit ?? tierLimits.maxScenariosPerRun,
    maxRunsPerMonth: explicitRunLimit ?? tierLimits.maxRunsPerMonth,
  };
}

export function getUtcMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
