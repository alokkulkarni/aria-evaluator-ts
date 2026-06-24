// src/judge/explain/turn-shapley.ts
// Native (no-Python) turn-level Shapley attribution for SESSION / security
// dimensions. Treats each attributable conversation turn as a coalition member,
// re-scores masked variants of the transcript via a deterministic (temp-0) judge,
// and computes each turn's Shapley value — i.e. "how much did this turn move the
// dimension score". Exact for small conversations; Monte-Carlo sampled above a
// threshold so cost stays bounded.

import type { Transcript } from '../../types/transcript.js';

export interface ShapleyTurnValue {
  /** Transcript turn index (matches Turn.index). */
  turnIndex: number;
  role: 'customer' | 'agent';
  contentPreview: string;
  /** Shapley value in score units (0–10). Signed: + raised the score, − lowered it. */
  value: number;
}

export interface TurnShapleyExplanation {
  method: 'shapley-turn';
  dimensionId: string;
  /** v(∅): the dimension score with every attributable turn masked. */
  baselineScore: number;
  /** v(N): the dimension score with the full conversation. */
  fullScore: number;
  /** Per-turn attribution; sum(value) ≈ fullScore − baselineScore. */
  turns: ShapleyTurnValue[];
  /** Distinct judge calls made (coalitions evaluated). */
  coalitionsEvaluated: number;
  /** true = exact Shapley over all 2^n coalitions; false = Monte-Carlo sampled. */
  exact: boolean;
  judgeModel: string;
  temperature: number;
  computedAt: string;
}

export interface TurnShapleyOptions {
  /** Compute exact Shapley when attributable turns ≤ this (2^n coalitions). Default 6. */
  exactMaxTurns?: number;
  /** Hard ceiling on distinct judge calls (sampling guard). Default 96. */
  maxCoalitions?: number;
  /** Permutations to sample when n exceeds exactMaxTurns. Default 32. */
  samplePermutations?: number;
  /** Seed for the sampling RNG (deterministic re-runs). Default 1. */
  seed?: number;
}

const PLACEHOLDER = '[turn omitted]';

function previewOf(s: string): string {
  const t = s.trim();
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
}

/** Small deterministic PRNG so sampled attributions are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/**
 * Compute turn-level Shapley values for one dimension.
 *
 * @param attributablePositions indices into `transcript.turns` to attribute over
 *        (others are kept as fixed context, never masked).
 * @param score re-scores a (masked) transcript → the target dimension's 0–10 score.
 */
export async function computeTurnShapley(params: {
  transcript: Transcript;
  attributablePositions: number[];
  dimensionId: string;
  judgeModel: string;
  temperature: number;
  score: (t: Transcript) => Promise<number>;
  options?: TurnShapleyOptions;
  /** Pass a real timestamp; the module never reads the clock itself. */
  now: string;
}): Promise<TurnShapleyExplanation> {
  const { transcript, attributablePositions, dimensionId, judgeModel, temperature, score, now } = params;
  const exactMaxTurns = params.options?.exactMaxTurns ?? 6;
  const maxCoalitions = params.options?.maxCoalitions ?? 96;
  const samplePermutations = params.options?.samplePermutations ?? 32;
  const seed = params.options?.seed ?? 1;

  const n = attributablePositions.length;

  const maskedTranscript = (presentMask: number): Transcript => ({
    ...transcript,
    turns: transcript.turns.map((turn, arrPos) => {
      const k = attributablePositions.indexOf(arrPos);
      if (k === -1) return turn; // fixed context
      return presentMask & (1 << k) ? turn : { ...turn, content: PLACEHOLDER };
    }),
  });

  const cache = new Map<number, number>();
  let coalitionsEvaluated = 0;
  const evalV = async (mask: number): Promise<number> => {
    const hit = cache.get(mask);
    if (hit !== undefined) return hit;
    if (coalitionsEvaluated >= maxCoalitions) {
      // Budget exhausted — approximate unseen coalitions with the nearest computed
      // value (the empty coalition) rather than spending more judge calls.
      return cache.get(0) ?? 0;
    }
    const v = await score(maskedTranscript(mask));
    coalitionsEvaluated += 1;
    cache.set(mask, v);
    return v;
  };

  const FULL = (1 << n) - 1;
  const baselineScore = n > 0 ? await evalV(0) : await score(transcript);
  const fullScore = n > 0 ? await evalV(FULL) : baselineScore;

  const phi = new Array(n).fill(0) as number[];
  const exact = n > 0 && n <= exactMaxTurns;

  if (n === 0) {
    // nothing to attribute
  } else if (exact) {
    // Precompute v for every coalition, then exact Shapley.
    for (let mask = 0; mask <= FULL; mask++) await evalV(mask);
    const nFact = factorial(n);
    for (let i = 0; i < n; i++) {
      const bit = 1 << i;
      let sum = 0;
      for (let mask = 0; mask <= FULL; mask++) {
        if (mask & bit) continue; // subsets S that do NOT contain i
        let s = 0;
        for (let b = 0; b < n; b++) if (mask & (1 << b)) s++;
        const weight = (factorial(s) * factorial(n - s - 1)) / nFact;
        sum += weight * ((cache.get(mask | bit) ?? 0) - (cache.get(mask) ?? 0));
      }
      phi[i] = sum;
    }
  } else {
    // Monte-Carlo permutation sampling (Castro et al.). Marginals reuse the cache.
    const rng = mulberry32(seed);
    const counts = new Array(n).fill(0) as number[];
    for (let p = 0; p < samplePermutations && coalitionsEvaluated < maxCoalitions; p++) {
      const order = [...Array(n).keys()];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
      let mask = 0;
      let prev = cache.get(0) ?? baselineScore;
      for (const idx of order) {
        const next = mask | (1 << idx);
        const v = await evalV(next);
        phi[idx]! += v - prev;
        counts[idx]! += 1;
        prev = v;
        mask = next;
      }
    }
    for (let i = 0; i < n; i++) if (counts[i]! > 0) phi[i]! /= counts[i]!;
  }

  const turns: ShapleyTurnValue[] = attributablePositions.map((arrPos, k) => {
    const turn = transcript.turns[arrPos]!;
    return {
      turnIndex: turn.index,
      role: turn.role,
      contentPreview: previewOf(turn.content),
      value: Math.round(phi[k]! * 100) / 100,
    };
  });

  return {
    method: 'shapley-turn',
    dimensionId,
    baselineScore,
    fullScore,
    turns,
    coalitionsEvaluated,
    exact,
    judgeModel,
    temperature,
    computedAt: now,
  };
}
