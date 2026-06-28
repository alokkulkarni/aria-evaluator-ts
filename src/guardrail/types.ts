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
