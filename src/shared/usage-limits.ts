export type PricingTier =
  | 'free'
  | 'individual'
  | 'enterprise_starter'
  | 'enterprise_pro'
  | 'enterprise_unlimited';

export interface TierLimits {
  maxScenariosPerRun: number;
  maxRunsPerMonth: number;
  maxModels: number;
}

export interface UsageLimits extends TierLimits {
  enabled: boolean;
  tier: PricingTier | null;
}

const DEFAULT_LIMITS_BY_TIER: Record<PricingTier, TierLimits> = {
  free:                 { maxScenariosPerRun: 10,  maxRunsPerMonth: 5,    maxModels: 1  },
  individual:           { maxScenariosPerRun: 30,  maxRunsPerMonth: 200,  maxModels: 2  },
  enterprise_starter:   { maxScenariosPerRun: 120, maxRunsPerMonth: 900,  maxModels: 8  },
  enterprise_pro:       { maxScenariosPerRun: 300, maxRunsPerMonth: 3000, maxModels: 20 },
  enterprise_unlimited: { maxScenariosPerRun: -1,  maxRunsPerMonth: -1,   maxModels: -1 },
};

const VALID_TIERS: ReadonlySet<string> = new Set<string>([
  'free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited',
]);

function parseTier(raw: string | undefined): PricingTier | null {
  const value = raw?.trim().toLowerCase();
  if (value && VALID_TIERS.has(value)) return value as PricingTier;
  return null;
}

function parseLimit(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < -1) return null;
  return parsed;
}

/**
 * Determine whether enforcement should be skipped (local environment).
 * Local is identified by ARIA_DEPLOY_ENV=local, or by NODE_ENV !== 'production'
 * when no deploy env is set at all (plain dev machine).
 */
function isLocalEnvironment(): boolean {
  const deployEnv = (process.env['ARIA_DEPLOY_ENV'] ?? process.env['ENVIRONMENT'] ?? '').trim().toLowerCase();
  if (deployEnv === 'local') return true;
  // If no deploy env is set, fall back to NODE_ENV check (covers plain `npm run dev`)
  if (!deployEnv && process.env['NODE_ENV'] !== 'production') return true;
  return false;
}

export function getUsageLimits(): UsageLimits {
  if (isLocalEnvironment()) {
    return {
      enabled: false,
      tier: null,
      maxScenariosPerRun: -1,
      maxRunsPerMonth: -1,
      maxModels: -1,
    };
  }

  // In deployed environments (dev/prod), default to 'free' if tier is missing/invalid (fail safe)
  const tier = parseTier(process.env['ARIA_PRICING_TIER'] ?? process.env['PRICING_TIER']) ?? 'free';
  const tierLimits = DEFAULT_LIMITS_BY_TIER[tier];
  const explicitScenarioLimit = parseLimit(process.env['MAX_SCENARIOS_PER_RUN'] ?? process.env['MAX_SCENARIOS']);
  const explicitRunLimit = parseLimit(process.env['MAX_RUNS_PER_MONTH'] ?? process.env['MAX_RUNS']);
  const explicitModelLimit = parseLimit(process.env['MAX_MODELS']);

  return {
    enabled: true,
    tier,
    maxScenariosPerRun: explicitScenarioLimit ?? tierLimits.maxScenariosPerRun,
    maxRunsPerMonth: explicitRunLimit ?? tierLimits.maxRunsPerMonth,
    maxModels: explicitModelLimit ?? tierLimits.maxModels,
  };
}

/** Get the tier defaults for display/reference (no env overrides). */
export function getTierDefaults(tier: PricingTier): TierLimits {
  return { ...DEFAULT_LIMITS_BY_TIER[tier] };
}

export function getUtcMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
