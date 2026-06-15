// src/lib/judge-drift.ts
// Pure helper: detect when the judge configuration used for recent runs has
// drifted from the configuration captured in a regression baseline. A judge
// change invalidates score-based regression comparison (a "regression" may just
// be a different judge), so we surface it explicitly rather than silently.

export interface JudgeDriftReport {
  /** True when at least one recent run used a different judge config than the baseline. */
  detected: boolean;
  baselineHash: string | null;
  /** Distinct run judgeConfigHashes that differ from the baseline. */
  mismatchedHashes: string[];
}

export function detectJudgeDrift(
  baselineHash: string | null | undefined,
  runHashes: Array<string | null | undefined>,
): JudgeDriftReport {
  const base = baselineHash ?? null;
  if (!base) {
    // No baseline hash recorded (pre-Phase-1 baseline) — can't assess drift.
    return { detected: false, baselineHash: null, mismatchedHashes: [] };
  }
  const mismatched = [...new Set(runHashes.filter((h): h is string => !!h && h !== base))];
  return { detected: mismatched.length > 0, baselineHash: base, mismatchedHashes: mismatched };
}

/** The most common non-null hash among the inputs (ties → first seen). */
export function predominantHash(hashes: Array<string | null | undefined>): string | null {
  const counts = new Map<string, number>();
  for (const h of hashes) {
    if (!h) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [h, c] of counts) {
    if (c > bestCount) {
      best = h;
      bestCount = c;
    }
  }
  return best;
}
