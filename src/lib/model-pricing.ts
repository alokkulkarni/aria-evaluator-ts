/**
 * Model pricing module — maps Bedrock model IDs to per-token costs (USD).
 *
 * Prices are sourced from AWS Bedrock pricing (June 2026) and are used to
 * compute estimated cost fields in EvalResult.  Only the judge model cost
 * can be reliably calculated because its model ID is captured in EvalResult.judgeModel.
 *
 * Scenario/provider costs are left null — the provider field (connect, lex, etc.)
 * does not map to a specific billable LLM model.
 */

export const PRICING_VERSION = 1;

export interface ModelPrice {
  /** USD per 1 000 input tokens */
  inputPer1k: number;
  /** USD per 1 000 output tokens */
  outputPer1k: number;
  /** Human-readable model label */
  label: string;
}

/**
 * Pricing registry keyed by bare Bedrock model ID.
 * Cross-region inference profile prefixes (us., eu., ap.) are stripped before lookup.
 */
const MODEL_PRICING: Record<string, ModelPrice> = {
  // ── Anthropic ─────────────────────────────────────────────────────────────
  'anthropic.claude-sonnet-4-5-20250929-v1:0': {
    label: 'Claude Sonnet 4.5',
    inputPer1k: 0.003,
    outputPer1k: 0.015,
  },
  'anthropic.claude-3-7-sonnet-20250219-v1:0': {
    label: 'Claude 3.7 Sonnet',
    inputPer1k: 0.003,
    outputPer1k: 0.015,
  },
  'anthropic.claude-opus-4-5-20251101-v1:0': {
    label: 'Claude Opus 4.5',
    inputPer1k: 0.015,
    outputPer1k: 0.075,
  },
  'anthropic.claude-haiku-4-5-20251001-v1:0': {
    label: 'Claude Haiku 4.5',
    inputPer1k: 0.0008,
    outputPer1k: 0.004,
  },
  'anthropic.claude-3-sonnet-20240229-v1:0': {
    label: 'Claude 3 Sonnet',
    inputPer1k: 0.003,
    outputPer1k: 0.015,
  },
  'anthropic.claude-3-haiku-20240307-v1:0': {
    label: 'Claude 3 Haiku',
    inputPer1k: 0.00025,
    outputPer1k: 0.00125,
  },

  // ── Amazon Nova ───────────────────────────────────────────────────────────
  'amazon.nova-pro-v1:0': {
    label: 'Nova Pro',
    inputPer1k: 0.0008,
    outputPer1k: 0.0032,
  },
  'amazon.nova-lite-v1:0': {
    label: 'Nova Lite',
    inputPer1k: 0.00006,
    outputPer1k: 0.00024,
  },
  'amazon.nova-micro-v1:0': {
    label: 'Nova Micro',
    inputPer1k: 0.000035,
    outputPer1k: 0.00014,
  },

  // ── Meta Llama ────────────────────────────────────────────────────────────
  'meta.llama3-70b-instruct-v1:0': {
    label: 'Llama 3 70B Instruct',
    inputPer1k: 0.00265,
    outputPer1k: 0.0035,
  },
  'meta.llama3-8b-instruct-v1:0': {
    label: 'Llama 3 8B Instruct',
    inputPer1k: 0.0003,
    outputPer1k: 0.0006,
  },

  // ── Mistral ───────────────────────────────────────────────────────────────
  'mistral.mistral-large-2402-v1:0': {
    label: 'Mistral Large',
    inputPer1k: 0.004,
    outputPer1k: 0.012,
  },
  'mistral.mixtral-8x7b-instruct-v0:1': {
    label: 'Mixtral 8x7B Instruct',
    inputPer1k: 0.00045,
    outputPer1k: 0.0007,
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────
  'deepseek.deepseek-r1-v1:0': {
    label: 'DeepSeek R1',
    inputPer1k: 0.00135,
    outputPer1k: 0.00540,
  },

  // ── External judge providers (cross-vendor committee) ─────────────────────
  // Keyed by the provider-native model id. Prices are approximate list prices
  // (June 2026) used only for cost estimates; unknown ids price to null.
  // OpenAI / Azure OpenAI (Azure uses the same model families; custom Azure
  // deployment names that don't match these ids price to null).
  'gpt-4o':       { label: 'OpenAI GPT-4o',       inputPer1k: 0.0025,  outputPer1k: 0.01 },
  'gpt-4o-mini':  { label: 'OpenAI GPT-4o mini',  inputPer1k: 0.00015, outputPer1k: 0.0006 },
  'gpt-4.1':      { label: 'OpenAI GPT-4.1',      inputPer1k: 0.002,   outputPer1k: 0.008 },
  'gpt-4.1-mini': { label: 'OpenAI GPT-4.1 mini', inputPer1k: 0.0004,  outputPer1k: 0.0016 },
  'o4-mini':      { label: 'OpenAI o4-mini',      inputPer1k: 0.0011,  outputPer1k: 0.0044 },

  // Google Gemini
  'gemini-1.5-pro':   { label: 'Gemini 1.5 Pro',   inputPer1k: 0.00125,  outputPer1k: 0.005 },
  'gemini-1.5-flash': { label: 'Gemini 1.5 Flash', inputPer1k: 0.000075, outputPer1k: 0.0003 },
  'gemini-2.0-flash': { label: 'Gemini 2.0 Flash', inputPer1k: 0.0001,   outputPer1k: 0.0004 },
  'gemini-2.5-pro':   { label: 'Gemini 2.5 Pro',   inputPer1k: 0.00125,  outputPer1k: 0.01 },

  // Anthropic direct API (non-Bedrock model ids)
  'claude-3-5-sonnet-20241022': { label: 'Claude 3.5 Sonnet (direct)', inputPer1k: 0.003,  outputPer1k: 0.015 },
  'claude-sonnet-4-5':          { label: 'Claude Sonnet 4.5 (direct)', inputPer1k: 0.003,  outputPer1k: 0.015 },
  'claude-opus-4-5':            { label: 'Claude Opus 4.5 (direct)',   inputPer1k: 0.015,  outputPer1k: 0.075 },
  'claude-haiku-4-5':           { label: 'Claude Haiku 4.5 (direct)',  inputPer1k: 0.0008, outputPer1k: 0.004 },
};

/**
 * Strip cross-region inference profile prefix (e.g. "eu.", "us.", "ap.") to
 * get the bare model ID used as the pricing key.
 */
function toBareModelId(modelId: string): string {
  return modelId.replace(/^(us|eu|ap)\./, '');
}

/**
 * Look up pricing for a model ID.  Returns null if the model is unknown.
 */
export function getModelPrice(modelId: string): ModelPrice | null {
  return MODEL_PRICING[toBareModelId(modelId)] ?? null;
}

export interface CostEstimate {
  /** Estimated USD cost for the operation */
  costUsd: number;
  /** Model ID used for pricing lookup */
  modelId: string;
  /** Pricing version for auditability */
  pricingVersion: number;
}

/**
 * Estimate the USD cost of an LLM invocation given token counts and model ID.
 *
 * Returns null when:
 * - model is not in the pricing registry
 * - token counts are missing
 */
export function estimateCost(
  modelId: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): CostEstimate | null {
  if (inputTokens == null && outputTokens == null) return null;

  const price = getModelPrice(modelId);
  if (!price) return null;

  const inputCost = ((inputTokens ?? 0) / 1000) * price.inputPer1k;
  const outputCost = ((outputTokens ?? 0) / 1000) * price.outputPer1k;

  return {
    costUsd: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000, // 6 decimal precision
    modelId: toBareModelId(modelId),
    pricingVersion: PRICING_VERSION,
  };
}

/**
 * List all known model IDs and their prices (for UI display).
 */
export function listModelPrices(): Array<{ modelId: string } & ModelPrice> {
  return Object.entries(MODEL_PRICING).map(([modelId, price]) => ({
    modelId,
    ...price,
  }));
}
