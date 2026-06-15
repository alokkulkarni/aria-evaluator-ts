// src/lib/calibration.ts
// Pure statistics for judge calibration against human ground truth.
// No IO/DB — unit-tested directly.

/** [judgeScore, humanScore] on the 0–10 scale. */
export type ScorePair = [number, number];

export type TrustLevel = 'trusted' | 'supplementary' | 'blocked' | 'insufficient';

export interface TrustThresholds {
  /** κ ≥ this → trusted. */
  trusted: number;
  /** κ ≥ this (and < trusted) → supplementary; below → blocked. */
  min: number;
  /** Minimum sample size before a judge is gated at all. */
  minSamples: number;
}

export const DEFAULT_TRUST_THRESHOLDS: TrustThresholds = { trusted: 0.8, min: 0.6, minSamples: 20 };

export interface CalibrationStats {
  sampleCount: number;
  weightedKappa: number;
  binaryKappa: number;
  withinOneRate: number;
  exactAgreement: number;
  meanAbsError: number;
}

function clampRound(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(x)));
}

/**
 * Quadratic-weighted Cohen's κ over integer score bands [minRating, maxRating].
 * Treats near-misses (8 vs 9) as mild disagreement and far-misses (2 vs 9) as
 * severe — the standard agreement metric for ordinal ratings.
 *  1 = perfect, 0 = chance, < 0 = systematically worse than chance.
 */
export function quadraticWeightedKappa(pairs: ScorePair[], minRating = 0, maxRating = 10): number {
  if (pairs.length === 0) return 0;
  const N = maxRating - minRating + 1;
  const O: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const h1 = new Array<number>(N).fill(0);
  const h2 = new Array<number>(N).fill(0);

  for (const [a, b] of pairs) {
    const i = clampRound(a, minRating, maxRating) - minRating;
    const j = clampRound(b, minRating, maxRating) - minRating;
    O[i]![j]! += 1;
    h1[i]! += 1;
    h2[j]! += 1;
  }

  const n = pairs.length;
  const w = (i: number, j: number) => ((i - j) * (i - j)) / ((N - 1) * (N - 1));
  let num = 0;
  let den = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const e = (h1[i]! * h2[j]!) / n;
      num += w(i, j) * O[i]![j]!;
      den += w(i, j) * e;
    }
  }
  if (den === 0) return 1; // no expected disagreement → treat as perfect
  return 1 - num / den;
}

/** Plain Cohen's κ on a pass/fail collapse (score ≥ threshold). */
export function cohenKappaBinary(pairs: ScorePair[], threshold = 6): number {
  if (pairs.length === 0) return 0;
  let bothPass = 0;
  let judgePassHumanFail = 0;
  let judgeFailHumanPass = 0;
  let bothFail = 0;
  for (const [j, h] of pairs) {
    const jp = j >= threshold;
    const hp = h >= threshold;
    if (jp && hp) bothPass++;
    else if (jp && !hp) judgePassHumanFail++;
    else if (!jp && hp) judgeFailHumanPass++;
    else bothFail++;
  }
  const n = pairs.length;
  const po = (bothPass + bothFail) / n;
  const pJudgePass = (bothPass + judgePassHumanFail) / n;
  const pHumanPass = (bothPass + judgeFailHumanPass) / n;
  const pe = pJudgePass * pHumanPass + (1 - pJudgePass) * (1 - pHumanPass);
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

export function withinOneRate(pairs: ScorePair[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter(([a, b]) => Math.abs(a - b) <= 1).length / pairs.length;
}

export function exactAgreement(pairs: ScorePair[]): number {
  if (pairs.length === 0) return 0;
  return pairs.filter(([a, b]) => Math.round(a) === Math.round(b)).length / pairs.length;
}

export function meanAbsError(pairs: ScorePair[]): number {
  if (pairs.length === 0) return 0;
  return pairs.reduce((s, [a, b]) => s + Math.abs(a - b), 0) / pairs.length;
}

export function computeCalibrationStats(pairs: ScorePair[]): CalibrationStats {
  return {
    sampleCount: pairs.length,
    weightedKappa: quadraticWeightedKappa(pairs),
    binaryKappa: cohenKappaBinary(pairs),
    withinOneRate: withinOneRate(pairs),
    exactAgreement: exactAgreement(pairs),
    meanAbsError: meanAbsError(pairs),
  };
}

export function classifyTrust(
  weightedKappa: number,
  sampleCount: number,
  thresholds: TrustThresholds = DEFAULT_TRUST_THRESHOLDS,
): TrustLevel {
  if (sampleCount < thresholds.minSamples) return 'insufficient';
  if (weightedKappa >= thresholds.trusted) return 'trusted';
  if (weightedKappa >= thresholds.min) return 'supplementary';
  return 'blocked';
}

/**
 * Committee weight derived from a calibration result.
 *  - blocked → 0 (excluded from live scoring)
 *  - insufficient → 1 (neutral; don't penalise uncalibrated judges)
 *  - otherwise → within-1 agreement rate, clamped to [0,1]
 */
export function weightForCalibration(c: { trust: TrustLevel; withinOneRate: number }): number {
  if (c.trust === 'blocked') return 0;
  if (c.trust === 'insufficient') return 1;
  return Math.max(0, Math.min(1, c.withinOneRate));
}

// ── Pairwise agreement (e.g. LMSYS Chatbot Arena) ────────────────────────────
export type PairwiseChoice = 'A' | 'B' | 'tie';

export interface PairwiseStats {
  /** Items with a decisive human winner (A/B), used for accuracy + κ. */
  sampleCount: number;
  /** Fraction of decisive-human items where the judge picked the same winner. */
  accuracy: number;
  /** Cohen's κ on the binary A/B choice over decisive-human items. */
  kappa: number;
  /** Fraction of ALL items where the human voted tie. */
  tieRate: number;
  /** Total items scored (including human ties). */
  totalItems: number;
}

/**
 * Agreement between a judge's pairwise verdicts and human pairwise votes —
 * the standard way to validate an LLM-judge against preference data like the
 * LMSYS Chatbot Arena. `pairs = [judgeChoice, humanChoice]`. Human ties have no
 * ground-truth winner, so they are excluded from accuracy/κ and reported as
 * tieRate. A judge "tie" on a decisive item counts as a miss for accuracy.
 */
export function pairwiseAgreement(pairs: Array<[PairwiseChoice, PairwiseChoice]>): PairwiseStats {
  const totalItems = pairs.length;
  const humanTies = pairs.filter(([, h]) => h === 'tie').length;
  const tieRate = totalItems === 0 ? 0 : humanTies / totalItems;

  const decisive = pairs.filter(([, h]) => h === 'A' || h === 'B');
  const sampleCount = decisive.length;
  if (sampleCount === 0) return { sampleCount: 0, accuracy: 0, kappa: 0, tieRate, totalItems };

  const correct = decisive.filter(([j, h]) => j === h).length;
  const accuracy = correct / sampleCount;

  // κ over items where BOTH gave a decisive A/B verdict — reuse cohenKappaBinary
  // by mapping A→10 (pass), B→0 (fail).
  const both = decisive.filter(([j]) => j === 'A' || j === 'B');
  const scorePairs: ScorePair[] = both.map(([j, h]) => [j === 'A' ? 10 : 0, h === 'A' ? 10 : 0]);
  const kappa = cohenKappaBinary(scorePairs);

  return { sampleCount, accuracy, kappa, tieRate, totalItems };
}
