// src/judge/risk-insights.ts
// Pure helpers that turn the judge's raw `risk` object into a normalized
// RiskInsight, and merge per-turn insights (TRACE dims) into one. No IO/SDK
// imports so this is trivially unit-tested. See docs/RISK_INSIGHTS_SPEC.md.

import type { RiskCategory, RiskInsight, RiskSeverity } from '../types/evaluation.js';

/**
 * Which dimensions carry which risk family. `bias_and_fairness` → bias;
 * `correctness` + `faithfulness` → hallucination (invented facts / contradictions).
 */
export const DIMENSION_RISK_CATEGORY: Record<string, RiskCategory> = {
  bias_and_fairness: 'bias',
  correctness: 'hallucination',
  faithfulness: 'hallucination',
};

/** Dimension ids that emit a risk insight — used to inject prompt instructions. */
export const RISK_DIMENSION_IDS = Object.keys(DIMENSION_RISK_CATEGORY);

/** Score (0–1) at/above which a risk-bearing dimension is considered clean. */
export const RISK_CLEAN_THRESHOLD = 0.8;

/** Raw shape the judge is asked to emit for a risk-bearing dimension. */
export interface RawRisk {
  detected?: boolean;
  severity?: string;
  reasons?: unknown;
  suggestions?: unknown;
  quotes?: unknown;
}

const SEVERITY_ORDER: Record<RiskSeverity, number> = { low: 0, medium: 1, high: 2 };

function normalizeSeverity(value: unknown): RiskSeverity {
  const v = String(value ?? '').toLowerCase();
  if (/high|critical|severe/.test(v)) return 'high';
  if (/low|minor|slight/.test(v)) return 'low';
  return 'medium';
}

/** Trim, drop empties, drop the literal "null"/"none", and de-duplicate. */
function cleanStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    // Models sometimes emit a single string instead of an array.
    if (typeof value === 'string') return cleanStrings([value]);
    return [];
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const s = item.trim();
    if (!s) continue;
    const lower = s.toLowerCase();
    if (lower === 'null' || lower === 'none' || lower === 'n/a') continue;
    const key = lower;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * Convert the judge's raw `risk` object for one dimension into a RiskInsight.
 * Returns undefined when nothing material was reported: no object, detected:false,
 * or detected:true but no reasons AND no suggestions (nothing actionable to show).
 */
export function normalizeRiskInsight(
  category: RiskCategory,
  raw: RawRisk | null | undefined,
): RiskInsight | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  if (raw.detected === false) return undefined;

  const reasons = cleanStrings(raw.reasons);
  const suggestions = cleanStrings(raw.suggestions);
  const evidenceQuotes = cleanStrings(raw.quotes);

  // detected can be true/undefined here; require something actionable to surface.
  if (reasons.length === 0 && suggestions.length === 0) return undefined;

  return {
    category,
    detected: true,
    severity: normalizeSeverity(raw.severity),
    reasons,
    suggestions,
    ...(evidenceQuotes.length > 0 ? { evidenceQuotes } : {}),
  };
}

/**
 * Merge the per-turn RiskInsights of a single TRACE dimension into one:
 * detected if any turn detected; reasons/suggestions/quotes = de-duplicated union;
 * severity = the max across turns. Returns undefined when the list has no insights.
 */
export function mergeRiskInsights(
  category: RiskCategory,
  insights: Array<RiskInsight | undefined>,
): RiskInsight | undefined {
  const present = insights.filter((i): i is RiskInsight => !!i);
  if (present.length === 0) return undefined;

  const reasons = cleanStrings(present.flatMap((i) => i.reasons));
  const suggestions = cleanStrings(present.flatMap((i) => i.suggestions));
  const evidenceQuotes = cleanStrings(present.flatMap((i) => i.evidenceQuotes ?? []));
  if (reasons.length === 0 && suggestions.length === 0) return undefined;

  const severity = present.reduce<RiskSeverity>(
    (max, i) => (SEVERITY_ORDER[i.severity] > SEVERITY_ORDER[max] ? i.severity : max),
    'low',
  );

  return {
    category,
    detected: true,
    severity,
    reasons,
    suggestions,
    ...(evidenceQuotes.length > 0 ? { evidenceQuotes } : {}),
  };
}
