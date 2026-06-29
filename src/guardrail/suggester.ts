// LLM-based guardrail suggester — the "expansion" half of the hybrid recommender.
// The curated knowledge base stays the authoritative core (see engine.ts); this
// asks Claude (via Bedrock) for ADDITIONAL guardrails tailored to the exact
// domain/sub-function/answers, validated with Zod and de-duplicated against the
// curated set. Results are clearly AI-suggested (id prefix + source flag) and must
// be treated as "verify citations". Fails closed: any error/timeout → [], so the
// recommend flow always returns the curated recs without waiting on the LLM.
import { z } from 'zod';

import { BedrockJudgeProvider } from '../judge/providers/bedrock.js';
import { AI_SUGGESTED_ID_PREFIX, type ClarifyingAnswers, type GuardrailRecommendation } from './types.js';

const SUGGESTER_MODEL_ID =
  process.env['GUARDRAIL_SUGGESTER_MODEL_ID']?.trim() || 'anthropic.claude-haiku-4-5-20251001-v1:0';

// Bounded so /recommend never hangs on a slow model — the curated recs are already
// in hand and returned on timeout. (BedrockJudgeProvider's own timeout is 90s, too
// long here; a Haiku call generating several detailed guardrails runs ~6–10s.)
const SUGGESTER_TIMEOUT_MS = Number(process.env['GUARDRAIL_SUGGESTER_TIMEOUT_MS']) || 15000;

// Fewer, higher-relevance additions — also keeps generation (and latency) down.
const MAX_SUGGESTIONS = 4;

function suggestionsEnabled(): boolean {
  return (process.env['GUARDRAIL_AI_SUGGESTIONS'] ?? 'on').toLowerCase() !== 'off';
}

// `severity` and `type` are accepted as free strings and normalised below — models
// emit "high"/"medium", "conflict-of-interest", etc., which a strict enum would drop.
const suggestionSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  rationale: z.string().min(1),
  regulations: z.array(z.string()).default([]),
  severity: z.string().optional(),
});

function normalizeSeverity(value: string | undefined): GuardrailRecommendation['severity'] {
  const v = (value ?? '').toLowerCase();
  if (/req|must|critical|high/.test(v)) return 'REQUIRED';
  if (/opt|may|low|nice/.test(v)) return 'OPTIONAL';
  return 'RECOMMENDED';
}

function normalizeType(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'GUARDRAIL';
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'guardrail';
}

const SYSTEM_PROMPT = [
  'You propose ADDITIONAL AI guardrails for a specific agent, on top of an already-curated set.',
  'Suggest guardrails that are genuinely specific to the domain, sub-function, and the clarifying answers',
  '— do NOT restate or rephrase any guardrail in the "already covered" list.',
  'Respond with ONLY a JSON array (no prose, no markdown fences). Each element:',
  '{ "type": string, "title": string, "description": string, "rationale": string, "regulations": string[], "severity": "REQUIRED"|"RECOMMENDED"|"OPTIONAL" }',
  `Return at most ${MAX_SUGGESTIONS} of the most relevant, non-duplicative guardrails.`,
  'CITATIONS: only include a regulation in "regulations" if you are confident it genuinely applies.',
  'If unsure, leave "regulations" empty rather than guessing — these are flagged to the user as unverified.',
].join('\n');

function buildUserPrompt(
  domain: string,
  subFunction: string,
  answers: ClarifyingAnswers,
  existing: GuardrailRecommendation[],
): string {
  const covered = existing.map((e) => `- ${e.title} (${e.guardrailType})`).join('\n') || '- (none)';
  return [
    `Domain: ${domain}`,
    `Sub-function: ${subFunction}`,
    `Clarifying answers: ${JSON.stringify(answers)}`,
    'Already covered (do NOT restate these):',
    covered,
    'Return the JSON array of additional guardrails.',
  ].join('\n');
}

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseSuggestions(text: string, existing: GuardrailRecommendation[]): GuardrailRecommendation[] {
  const json = extractJsonArray(text);
  if (!json) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];

  const seenTitles = new Set(existing.map((e) => normalizeTitle(e.title)));
  const seenIds = new Set(existing.map((e) => e.id));
  const out: GuardrailRecommendation[] = [];

  for (const item of raw) {
    if (out.length >= MAX_SUGGESTIONS) break;
    const parsed = suggestionSchema.safeParse(item);
    if (!parsed.success) continue;

    const norm = normalizeTitle(parsed.data.title);
    if (seenTitles.has(norm)) continue; // de-dup vs curated + earlier suggestions
    seenTitles.add(norm);

    let id = `${AI_SUGGESTED_ID_PREFIX}${slugify(parsed.data.title)}`;
    while (seenIds.has(id)) id = `${id}-x`;
    seenIds.add(id);

    out.push({
      id,
      guardrailType: normalizeType(parsed.data.type),
      severity: normalizeSeverity(parsed.data.severity),
      title: parsed.data.title,
      description: parsed.data.description,
      rationale: parsed.data.rationale,
      regulations: parsed.data.regulations,
      source: 'ai-suggested',
    });
  }
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('suggester timeout')), ms)),
  ]);
}

/**
 * Propose additional, answer-tailored guardrails beyond the curated `existing` set.
 * Returns [] on any failure/timeout or when disabled (GUARDRAIL_AI_SUGGESTIONS=off).
 */
export async function suggestGuardrails(
  domain: string,
  subFunction: string,
  answers: ClarifyingAnswers,
  existing: GuardrailRecommendation[],
): Promise<GuardrailRecommendation[]> {
  if (!suggestionsEnabled()) return [];
  try {
    const provider = new BedrockJudgeProvider();
    const resp = await withTimeout(
      provider.complete({
        modelId: SUGGESTER_MODEL_ID,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: buildUserPrompt(domain, subFunction, answers, existing),
        temperature: 0.3,
        maxTokens: 1200,
      }),
      SUGGESTER_TIMEOUT_MS,
    );
    return parseSuggestions(resp.text, existing);
  } catch {
    return [];
  }
}
