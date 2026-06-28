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
      });
    }
  }
  return out;
}

function answerValues(answers: ClarifyingAnswers, key: string): string[] {
  const raw = answers[key];
  if (Array.isArray(raw)) return raw.map((v) => v.toUpperCase());
  if (typeof raw === 'string' && raw.length > 0) return [raw.toUpperCase()];
  return [];
}

function isEuJurisdiction(answers: ClarifyingAnswers): boolean {
  return answerValues(answers, 'jurisdiction').some(
    (v) => v === 'EU' || v === 'GDPR' || v.includes('GDPR') || v.includes('EU'),
  );
}

/**
 * Return guardrail recommendations for a domain + sub-function, augmented by the
 * clarifying answers (e.g. EU jurisdiction adds GDPR entries) and sorted
 * REQUIRED → RECOMMENDED → OPTIONAL (stable within each severity).
 */
export async function getRecommendations(
  domain: string,
  subFunction: string,
  clarifyingAnswers: ClarifyingAnswers,
): Promise<GuardrailRecommendation[]> {
  const kb = loadKnowledgeBase();

  const merged: GuardrailRecommendation[] = entryToRecommendations(kb[`${domain}:${subFunction}`]);
  const seen = new Set(merged.map((r) => r.id));

  if (isEuJurisdiction(clarifyingAnswers)) {
    for (const rec of entryToRecommendations(kb['jurisdiction:EU'])) {
      if (!seen.has(rec.id)) {
        merged.push(rec);
        seen.add(rec.id);
      }
    }
  }

  return merged
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => SEVERITY_RANK[a.rec.severity] - SEVERITY_RANK[b.rec.severity] || a.index - b.index)
    .map(({ rec }) => rec);
}
