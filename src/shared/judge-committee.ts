// src/shared/judge-committee.ts
// Shared types + helpers describing a multi-judge committee. Pure module:
// no SDK or heavy imports so it can be used from server, CLI, and tests.

import { createHash } from 'node:crypto';

export type JudgeProviderId = 'bedrock' | 'openai' | 'azure-openai' | 'anthropic' | 'gemini';
export type JudgeRole = 'generalist' | 'security' | 'domain';
export type AggregationMethod = 'mean';

export const ALL_JUDGE_PROVIDERS: JudgeProviderId[] = [
  'bedrock',
  'openai',
  'azure-openai',
  'anthropic',
  'gemini',
];

export interface JudgeSpec {
  /** Stable identifier, unique within a committee (used as the vote key). */
  id: string;
  provider: JudgeProviderId;
  /** Provider-native model identifier (bare Bedrock id, OpenAI model, Azure deployment, etc.). */
  modelId: string;
  /** Bedrock-only: region override for the inference profile. */
  region?: string;
  role?: JudgeRole;
  /** Reserved for Phase 3 calibration weighting. Defaults to 1. */
  weight?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface JudgeCommitteeConfig {
  judges: JudgeSpec[];
  /** Score-range (0–10) above which judges are considered to disagree on a dimension. */
  disagreementThreshold: number;
  aggregation: AggregationMethod;
  /** Shared judge system prompt applied to every member unless overridden. */
  systemPrompt: string;
}

export const DEFAULT_DISAGREEMENT_THRESHOLD = 2.0;
export const DEFAULT_OPENAI_JUDGE_MODEL = 'gpt-4o';
export const DEFAULT_NOVA_JUDGE_MODEL = 'amazon.nova-pro-v1:0';
export const DEFAULT_ANTHROPIC_JUDGE_MODEL = 'claude-sonnet-4-5';
// Gemini judge default — overridable via GEMINI_JUDGE_MODEL (use the latest 3.x).
export const DEFAULT_GEMINI_JUDGE_MODEL = 'gemini-3.0-pro';

type Env = Record<string, string | undefined>;

/**
 * Whether a provider has the credentials it needs. Pure env inspection (no SDK
 * imports) so it is safe to call from the lightweight settings layer. Bedrock is
 * assumed available (AWS creds arrive via the task role / instance profile).
 */
export function providerAvailable(provider: JudgeProviderId, env: Env = process.env): boolean {
  switch (provider) {
    case 'bedrock':
      return true;
    case 'openai':
      return !!env['OPENAI_API_KEY']?.trim();
    case 'azure-openai':
      return !!(env['AZURE_OPENAI_API_KEY']?.trim() && env['AZURE_OPENAI_ENDPOINT']?.trim());
    case 'anthropic':
      return !!env['ANTHROPIC_API_KEY']?.trim();
    case 'gemini':
      return !!(env['GEMINI_API_KEY']?.trim() || env['GOOGLE_API_KEY']?.trim());
    default:
      return false;
  }
}

export function availableProviders(env: Env = process.env): Set<JudgeProviderId> {
  return new Set(ALL_JUDGE_PROVIDERS.filter((p) => providerAvailable(p, env)));
}

/** Coarse vendor/family label, used to detect (and avoid) intra-family judging. */
export function vendorForSpec(spec: Pick<JudgeSpec, 'provider' | 'modelId'>): string {
  switch (spec.provider) {
    case 'openai':
    case 'azure-openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'gemini':
      return 'google';
    case 'bedrock': {
      const bare = spec.modelId.replace(/^(us|eu|ap)\./, '');
      return bare.split('.')[0] || 'bedrock';
    }
    default:
      return 'unknown';
  }
}

export type ScenarioCategory = 'security' | 'domain' | 'generalist';

/** Scenario → routing category. Adversarial wins over domain. */
export function scenarioCategory(input: { attack_type?: string | null; domain?: string | null }): ScenarioCategory {
  if (input.attack_type) return 'security';
  if (input.domain) return 'domain';
  return 'generalist';
}

/**
 * Select which committee judges run for a scenario category (specialist routing).
 * Additive: matching specialists PLUS generalists; specialists for a *different*
 * category are excluded. Never returns an empty set — if nothing matches (e.g. a
 * security scenario but only domain judges configured), falls back to all judges.
 */
export function routeJudges<T extends Pick<JudgeSpec, 'role'>>(judges: T[], category: ScenarioCategory): T[] {
  const matches = (j: T) => {
    const role = j.role ?? 'generalist';
    return role === 'generalist' || role === category;
  };
  const routed = judges.filter(matches);
  return routed.length > 0 ? routed : judges;
}

export interface VendorDiversity {
  vendors: string[];
  vendorCount: number;
  /** True when the judges span ≥2 vendor families (mitigates self-enhancement bias). */
  crossVendor: boolean;
}

/**
 * Assess how many distinct vendor families a set of judges spans. A single-vendor
 * committee risks intra-family (self-enhancement) bias — the core failure mode the
 * multi-judge design exists to avoid.
 */
export function assessVendorDiversity(judges: Array<Pick<JudgeSpec, 'provider' | 'modelId'>>): VendorDiversity {
  const vendors = [...new Set(judges.map((j) => vendorForSpec(j)))];
  return { vendors, vendorCount: vendors.length, crossVendor: vendors.length >= 2 };
}

/**
 * Build the default committee automatically from whatever providers have
 * credentials — one generalist judge per available API provider, so the panel
 * spans as many distinct vendors as possible (the cross-vendor design that
 * mitigates self-enhancement bias). No manual model selection required.
 *
 * Bedrock is always available (AWS creds) and contributes Amazon Nova, so the
 * Anthropic slot can come from the direct Anthropic API when that key is present
 * (falling back to Claude-via-Bedrock otherwise). `capCommittee` later trims to
 * the plan's max-judge count. Composition is deterministic for a given set of
 * credentials so repeated runs stay comparable (baseline drift).
 */
export function buildDefaultCommittee(params: {
  bedrockModelId: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  disagreementThreshold: number;
  availableProviders: Set<JudgeProviderId>;
}): JudgeCommitteeConfig {
  const ap = params.availableProviders;
  const judges: JudgeSpec[] = [];

  // Amazon (via Bedrock — always available).
  judges.push({ id: 'bedrock-nova', provider: 'bedrock', modelId: DEFAULT_NOVA_JUDGE_MODEL, role: 'generalist' });

  // Anthropic — prefer the direct API key; otherwise Claude via Bedrock.
  if (ap.has('anthropic')) {
    judges.push({ id: 'anthropic-claude', provider: 'anthropic', modelId: DEFAULT_ANTHROPIC_JUDGE_MODEL, role: 'generalist' });
  } else {
    judges.push({ id: 'bedrock-claude', provider: 'bedrock', modelId: params.bedrockModelId, role: 'generalist' });
  }

  // OpenAI (direct, or Azure OpenAI deployment if that's what's configured).
  if (ap.has('openai')) {
    judges.push({ id: 'openai-gpt', provider: 'openai', modelId: DEFAULT_OPENAI_JUDGE_MODEL, role: 'generalist' });
  } else if (ap.has('azure-openai')) {
    judges.push({ id: 'azure-openai', provider: 'azure-openai', modelId: process.env['AZURE_OPENAI_JUDGE_DEPLOYMENT']?.trim() || DEFAULT_OPENAI_JUDGE_MODEL, role: 'generalist' });
  }

  // Google.
  if (ap.has('gemini')) {
    judges.push({ id: 'gemini', provider: 'gemini', modelId: process.env['GEMINI_JUDGE_MODEL']?.trim() || DEFAULT_GEMINI_JUDGE_MODEL, role: 'generalist' });
  }

  return {
    judges,
    disagreementThreshold: params.disagreementThreshold,
    aggregation: 'mean',
    systemPrompt: params.systemPrompt,
  };
}

/**
 * Cap a committee to a plan's maximum judge count (cost control). Keeps the first
 * N judges — the default order is generalist → cross-vendor → …, so N=2 stays
 * cross-vendor. maxJudges < 0 means uncapped; never returns an empty list.
 */
export function capCommittee<T>(judges: T[], maxJudges: number): T[] {
  if (maxJudges < 0 || judges.length <= maxJudges) return judges;
  return judges.slice(0, Math.max(1, maxJudges));
}

/** Validate + normalise a committee. Throws on structural problems. */
export function validateCommittee(config: JudgeCommitteeConfig): JudgeCommitteeConfig {
  if (!config || !Array.isArray(config.judges) || config.judges.length === 0) {
    throw new Error('Judge committee must contain at least one judge.');
  }
  const seen = new Set<string>();
  for (const judge of config.judges) {
    if (!judge.id || typeof judge.id !== 'string') throw new Error('Each judge needs a string id.');
    if (seen.has(judge.id)) throw new Error(`Duplicate judge id: ${judge.id}`);
    seen.add(judge.id);
    if (!ALL_JUDGE_PROVIDERS.includes(judge.provider)) {
      throw new Error(`Judge ${judge.id}: unknown provider "${judge.provider}".`);
    }
    if (!judge.modelId || typeof judge.modelId !== 'string') {
      throw new Error(`Judge ${judge.id}: modelId is required.`);
    }
    if (judge.weight != null && (!Number.isFinite(judge.weight) || judge.weight < 0)) {
      throw new Error(`Judge ${judge.id}: weight must be a non-negative number.`);
    }
  }
  const threshold = config.disagreementThreshold;
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 10) {
    throw new Error('disagreementThreshold must be between 0 and 10.');
  }
  return config;
}

/** Parse the JUDGE_COMMITTEE settings JSON into a validated config. */
export function parseCommitteeJson(raw: string, systemPrompt: string): JudgeCommitteeConfig {
  const parsed = JSON.parse(raw) as Partial<JudgeCommitteeConfig>;
  const config: JudgeCommitteeConfig = {
    judges: parsed.judges ?? [],
    disagreementThreshold: parsed.disagreementThreshold ?? DEFAULT_DISAGREEMENT_THRESHOLD,
    aggregation: 'mean',
    systemPrompt: parsed.systemPrompt?.trim() || systemPrompt,
  };
  return validateCommittee(config);
}

/** Short human label for EvalResult.judgeModel back-compat, e.g. "committee:claude-sonnet-4-5+gpt-4o". */
export function committeeLabel(config: JudgeCommitteeConfig): string {
  if (config.judges.length === 1) return config.judges[0]!.modelId;
  const shorten = (m: string) => m.replace(/^(us|eu|ap)\./, '').replace(/^[a-z-]+\./, '').replace(/-v\d+:\d+$/, '');
  return `committee:${config.judges.map((j) => shorten(j.modelId)).join('+')}`;
}

/**
 * Deterministic hash of the judge configuration. Consumed in later phases for
 * regression-baseline drift detection (a judge change invalidates a baseline).
 */
export function computeJudgeConfigHash(config: JudgeCommitteeConfig): string {
  const canonical = {
    aggregation: config.aggregation,
    disagreementThreshold: config.disagreementThreshold,
    systemPrompt: config.systemPrompt,
    judges: [...config.judges]
      .map((j) => ({
        provider: j.provider,
        modelId: j.modelId,
        role: j.role ?? 'generalist',
        temperature: j.temperature ?? null,
        maxTokens: j.maxTokens ?? null,
        weight: j.weight ?? 1,
      }))
      .sort((a, b) => `${a.provider}:${a.modelId}`.localeCompare(`${b.provider}:${b.modelId}`)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}
