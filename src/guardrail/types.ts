// Shared TypeScript types for the Guardrail Advisor (Phase 1).
// See docs/GUARDRAIL_ADVISOR_PHASE1.md for the full spec. Union types are used in
// place of TS enums to match the codebase convention (see src/shared/*).

/** Agent platforms supported for config formatting (Phase 1). */
export type Platform = 'bedrock' | 'langchain' | 'copilot' | 'foundry' | 'strands';

export const PLATFORMS: readonly Platform[] = [
  'bedrock',
  'langchain',
  'copilot',
  'foundry',
  'strands',
] as const;

/** Severity buckets for a recommended guardrail, ordered most-to-least critical. */
export type GuardrailSeverity = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';

/** Severities in their canonical sort order (REQUIRED first). */
export const GUARDRAIL_SEVERITIES: readonly GuardrailSeverity[] = [
  'REQUIRED',
  'RECOMMENDED',
  'OPTIONAL',
] as const;

/** Output language of a formatted platform config. */
export type ConfigLanguage = 'yaml' | 'json' | 'python' | 'text';

/** The render type for a clarifying question in the wizard (Step 2). */
export type ClarifyingQuestionType = 'single-choice' | 'multi-choice' | 'text';

export const CLARIFYING_QUESTION_TYPES: readonly ClarifyingQuestionType[] = [
  'single-choice',
  'multi-choice',
  'text',
] as const;

export interface ClarifyingQuestionOption {
  value: string;
  label: string;
}

/** A single clarifying question returned by the clarifier and rendered by the UI. */
export interface ClarifyingQuestion {
  id: string;
  text: string;
  type: ClarifyingQuestionType;
  /** Present (≥2 entries) for single-choice / multi-choice; absent for text. */
  options?: ClarifyingQuestionOption[];
}

/** Raw clarifying answers keyed by question id. Multi-choice answers are arrays. */
export type ClarifyingAnswers = Record<string, string | string[]>;

/**
 * Free-text context for a user-defined (custom) domain / sub-function. Threaded
 * into the clarifier and the AI suggester so they can reason about an agent that
 * isn't in the curated taxonomy. All fields optional; absent for curated selections.
 */
export interface GuardrailContext {
  domainLabel?: string;
  domainDescription?: string;
  subFunctionLabel?: string;
  subFunctionDescription?: string;
}

/** Where a recommendation came from: the curated knowledge base, or LLM-suggested. */
export type GuardrailSource = 'curated' | 'ai-suggested';

/** Prefix on AI-suggested guardrail ids — lets `source` be derived after persistence. */
export const AI_SUGGESTED_ID_PREFIX = 'ai-';

/** A guardrail recommendation returned by the engine for a domain + sub-function. */
export interface GuardrailRecommendation {
  id: string;
  /** TOPIC_DENIAL | PII_FILTER | CONTENT_FILTER | … (free-form guardrail category). */
  guardrailType: string;
  severity: GuardrailSeverity;
  title: string;
  description: string;
  rationale: string;
  regulations: string[];
  /** 'curated' = verified knowledge base; 'ai-suggested' = LLM-proposed (verify citations). */
  source: GuardrailSource;
}

/** A platform-specific formatted config produced by the RAG formatter. */
export interface FormattedConfig {
  /** Formatted YAML/JSON/Python/text as a string. */
  config: string;
  language: ConfigLanguage;
  /** RAG source citations — the doc URLs the config was generated from. */
  sourceDocUrls: string[];
  /** ISO timestamp of the most recent crawl backing this config. */
  docsFreshAsOf: string;
}

// ─── Curated knowledge base (static JSON, Phase 1) ──────────────────────────────

/** A single guardrail as stored in guardrail-knowledge.json (severity is implied
 *  by which bucket it lives in). */
export interface KnowledgeGuardrail {
  id: string;
  /** Guardrail category, e.g. TOPIC_DENIAL | PII_FILTER | CONTENT_FILTER. */
  type: string;
  title: string;
  /** Optional richer description; falls back to `title` when absent. */
  description?: string;
  rationale: string;
  regulations: string[];
}

/** A knowledge-base entry keyed by `domain:subFunction` (or `jurisdiction:CODE`). */
export interface KnowledgeEntry {
  required?: KnowledgeGuardrail[];
  recommended?: KnowledgeGuardrail[];
  optional?: KnowledgeGuardrail[];
}

export type GuardrailKnowledgeBase = Record<string, KnowledgeEntry>;

// ─── Domain taxonomy (static JSON, Phase 1) ─────────────────────────────────────

export interface SubFunction {
  id: string;
  label: string;
}

export interface Domain {
  id: string;
  label: string;
  subFunctions: SubFunction[];
}

export interface DomainTaxonomy {
  domains: Domain[];
}
