// Guardrail recommendation engine: maps a domain + sub-function (+ clarifying
// answers) to an ordered list of recommended guardrails from the curated knowledge
// base. See docs/GUARDRAIL_ADVISOR_PHASE1.md → "Guardrail Recommendation Engine".
import { loadKnowledgeBase } from './data.js';
import type {
  ClarifyingAnswers,
  GuardrailRecommendation,
  GuardrailSeverity,
  KnowledgeEntry,
} from './types.js';

const SEVERITY_BUCKETS: { key: keyof KnowledgeEntry; severity: GuardrailSeverity }[] = [
  { key: 'required', severity: 'REQUIRED' },
  { key: 'recommended', severity: 'RECOMMENDED' },
  { key: 'optional', severity: 'OPTIONAL' },
];

const SEVERITY_RANK: Record<GuardrailSeverity, number> = {
  REQUIRED: 0,
  RECOMMENDED: 1,
  OPTIONAL: 2,
};

function entryToRecommendations(entry: KnowledgeEntry | undefined): GuardrailRecommendation[] {
  if (!entry) return [];
  const out: GuardrailRecommendation[] = [];
  for (const { key, severity } of SEVERITY_BUCKETS) {
    for (const g of entry[key] ?? []) {
      out.push({
        id: g.id,
        guardrailType: g.type,
        severity,
        title: g.title,
        description: g.description ?? g.title,
        rationale: g.rationale,
        regulations: g.regulations ?? [],
        source: 'curated',
      });
    }
  }
  return out;
}

// Flatten every clarifying answer value into one normalised, lowercased string so
// signal detection works regardless of the (LLM-generated) question ids and is
// robust to both canonical values ("uk") and natural-language ones ("United
// Kingdom"). Hyphens/underscores/slashes become spaces ("account-numbers",
// "trades/transfers").
function normalizedAnswerText(answers: ClarifyingAnswers): string {
  const parts: string[] = [];
  for (const value of Object.values(answers)) {
    if (Array.isArray(value)) parts.push(...value);
    else if (typeof value === 'string') parts.push(value);
  }
  return parts.join(' | ').toLowerCase().replace(/[-_/]/g, ' ');
}

// Map a detected answer signal to a knowledge-base augment entry. The base entry
// always applies; these add guardrails that genuinely depend on the answers so the
// recommendation set changes (and grows) with the user's choices.
const AUGMENT_SIGNALS: { key: string; test: (text: string) => boolean }[] = [
  { key: 'jurisdiction:EU', test: (t) => /\beu\b|european|gdpr|\beea\b/.test(t) },
  { key: 'jurisdiction:US', test: (t) => /\bus\b|\busa\b|united states|finra|\bsec\b|\bcfpb\b|ccpa|cpra/.test(t) },
  { key: 'jurisdiction:UK', test: (t) => /\buk\b|\bgb\b|united kingdom|britain|\bfca\b|\bico\b/.test(t) },
  { key: 'jurisdiction:HIPAA', test: (t) => /hipaa/.test(t) },
  { key: 'jurisdiction:APAC', test: (t) => /\basia\b|pacific|\bapac\b|singapore|australia|\bpdpa\b/.test(t) },
  { key: 'autonomy:transactional', test: (t) => /autonom|execut|transact|\btrade|transfer|agentic|hybrid|take action|act on behalf/.test(t) },
  { key: 'data:sensitive', test: (t) => /\bssn\b|tax id|\baccount|\bhealth|\bbiometric|\bincome\b|\basset|investment|portfolio|medical|\bpii\b|personal data|card number|sort code/.test(t) },
  { key: 'users:external', test: (t) => /retail|individual|customer|consumer|\bpublic\b|end user|\bclient|policyholder|patient|applicant|candidate|user base/.test(t) },
];

// Stable sort REQUIRED → RECOMMENDED → OPTIONAL (preserving input order within a severity).
function sortBySeverity(recs: GuardrailRecommendation[]): GuardrailRecommendation[] {
  return recs
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => SEVERITY_RANK[a.rec.severity] - SEVERITY_RANK[b.rec.severity] || a.index - b.index)
    .map(({ rec }) => rec);
}

// Append answer-driven augment entries (jurisdiction → regional rules, autonomy →
// human-in-the-loop, sensitive data → data controls, external users → AI disclosure),
// de-duplicated by id. Mutates `merged`. `signals` lets callers restrict which augments
// apply (the universal baseline already covers the generic ones — see below).
function applyAnswerAugments(
  merged: GuardrailRecommendation[],
  clarifyingAnswers: ClarifyingAnswers,
  signals: typeof AUGMENT_SIGNALS = AUGMENT_SIGNALS,
): void {
  const kb = loadKnowledgeBase();
  const seen = new Set(merged.map((r) => r.id));
  const text = normalizedAnswerText(clarifyingAnswers);

  for (const { key, test } of signals) {
    if (!test(text)) continue;
    for (const rec of entryToRecommendations(kb[key])) {
      if (!seen.has(rec.id)) {
        merged.push(rec);
        seen.add(rec.id);
      }
    }
  }
}

// The universal baseline already covers generic AI disclosure (universal-ai-disclosure)
// and sensitive-data protection (universal-sensitive-data-protection), so the matching
// generic augments would render near-duplicate cards. Skip them for the baseline path;
// keep jurisdiction + autonomy augments, which add genuinely additive legal/operational
// specifics (de-dup is by id, which can't catch these semantic overlaps).
const BASELINE_SKIP_AUGMENT_KEYS = new Set(['users:external', 'data:sensitive']);
const BASELINE_AUGMENT_SIGNALS = AUGMENT_SIGNALS.filter((s) => !BASELINE_SKIP_AUGMENT_KEYS.has(s.key));

/** Knowledge-base key for the verified universal AI-safety baseline. */
export const UNIVERSAL_BASELINE_KEY = 'universal:baseline';

/**
 * Return guardrail recommendations for a domain + sub-function. The curated base
 * entry always applies; clarifying answers add answer-specific guardrails
 * (jurisdiction → regional rules, autonomy → human-in-the-loop, sensitive data →
 * data controls, external users → AI disclosure). Sorted REQUIRED → RECOMMENDED →
 * OPTIONAL (stable within each severity); ids are de-duplicated.
 */
export async function getRecommendations(
  domain: string,
  subFunction: string,
  clarifyingAnswers: ClarifyingAnswers,
): Promise<GuardrailRecommendation[]> {
  const kb = loadKnowledgeBase();

  const merged: GuardrailRecommendation[] = entryToRecommendations(kb[`${domain}:${subFunction}`]);
  // Only augment a recognised sub-function (don't synthesise recs from answers alone).
  if (merged.length === 0) return merged;

  applyAnswerAugments(merged, clarifyingAnswers);
  return sortBySeverity(merged);
}

/**
 * Return the verified universal AI-safety baseline — guardrails that apply to ANY
 * agent (prompt-injection resistance, data protection, scope limits, harmful-content
 * filtering, hallucination controls, human oversight, AI disclosure, audit logging).
 * Used as the curated core for custom (user-defined) domains/functions, which have no
 * domain-specific knowledge-base entry. Answer-driven augments still apply.
 */
export function getUniversalBaseline(clarifyingAnswers: ClarifyingAnswers): GuardrailRecommendation[] {
  const kb = loadKnowledgeBase();
  const merged = entryToRecommendations(kb[UNIVERSAL_BASELINE_KEY]);
  applyAnswerAugments(merged, clarifyingAnswers, BASELINE_AUGMENT_SIGNALS);
  return sortBySeverity(merged);
}
