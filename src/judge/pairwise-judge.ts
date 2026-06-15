// src/judge/pairwise-judge.ts
// Direct per-judge PAIRWISE comparison (response A vs B) for the pairwise
// calibration track. Bypasses the 15-dimension pipeline — each judge just picks
// the better response, which we compare to a human vote (e.g. LMSYS Arena).

import type { PairwiseChoice } from '../lib/calibration.js';
import type { JudgeSpec } from '../shared/judge-committee.js';
import { createJudgeProvider } from './providers/factory.js';
import { JUDGE_CALL_TIMEOUT_MS, withTimeout } from './providers/types.js';

export interface PairwiseJudgeResult {
  judgeId: string;
  provider: string;
  modelId: string;
  preferred: PairwiseChoice;
  reason: string;
}

export const DEFAULT_PAIRWISE_SYSTEM_PROMPT =
  'You are an impartial evaluator comparing two AI assistant responses (A and B) to the same user prompt. ' +
  'Decide which response is better overall, weighing helpfulness, correctness, relevance, and safety. ' +
  'Do NOT favour a response for being longer, more verbose, or for appearing first — judge only on quality. ' +
  'If they are genuinely equal (or equally poor), answer "tie". ' +
  'Respond with STRICT JSON only, no prose: {"winner":"A"|"B"|"tie","reason":"<one short sentence>"}.';

function buildUserPrompt(prompt: string, a: string, b: string): string {
  return [
    '[User prompt]',
    prompt,
    '',
    '[Response A]',
    a,
    '',
    '[Response B]',
    b,
    '',
    'Which response is better? Reply with strict JSON: {"winner":"A"|"B"|"tie","reason":"..."}.',
  ].join('\n');
}

function parseVerdict(text: string): { preferred: PairwiseChoice; reason: string } | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as { winner?: unknown; reason?: unknown };
    const w = String(obj.winner ?? '').trim().toUpperCase();
    const preferred: PairwiseChoice | null = w === 'A' ? 'A' : w === 'B' ? 'B' : w === 'TIE' ? 'tie' : null;
    if (!preferred) return null;
    return { preferred, reason: typeof obj.reason === 'string' ? obj.reason.slice(0, 500) : '' };
  } catch {
    return null;
  }
}

/**
 * Ask each active committee judge to compare A vs B. Failing or unparseable
 * judges are skipped (the committee tolerates partial failure). Judges run
 * concurrently for a single item; callers iterate items sequentially to bound
 * provider load.
 */
export async function judgePairwise(
  prompt: string,
  responseA: string,
  responseB: string,
  specs: JudgeSpec[],
  systemPrompt?: string,
): Promise<PairwiseJudgeResult[]> {
  const sys = systemPrompt?.trim() || DEFAULT_PAIRWISE_SYSTEM_PROMPT;
  const userPrompt = buildUserPrompt(prompt, responseA, responseB);

  const settled = await Promise.allSettled(
    specs.map(async (spec): Promise<PairwiseJudgeResult | null> => {
      const provider = createJudgeProvider(spec.provider);
      const resp = await withTimeout(
        provider.complete({
          modelId: spec.modelId,
          systemPrompt: sys,
          userPrompt,
          temperature: spec.temperature ?? 0,
          maxTokens: spec.maxTokens ?? 512,
          region: spec.region,
        }),
        JUDGE_CALL_TIMEOUT_MS,
        `pairwise:${spec.id}`,
      );
      const v = parseVerdict(resp.text);
      if (!v) return null;
      return {
        judgeId: spec.id,
        provider: spec.provider,
        modelId: spec.modelId,
        preferred: v.preferred,
        reason: v.reason,
      };
    }),
  );

  return settled
    .filter((r): r is PromiseFulfilledResult<PairwiseJudgeResult | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v): v is PairwiseJudgeResult => v !== null);
}
