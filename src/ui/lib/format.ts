/**
 * Format a duration given in milliseconds into a human-readable string,
 * automatically scaling to the most readable unit:
 *
 *   < 1 000 ms  →  "466 ms"
 *   < 60 000 ms →  "4.7 s"     (one decimal, trailing zero stripped)
 *   ≥ 60 000 ms →  "7m 46s"    (minutes + whole seconds)
 */
export function formatLatency(ms: number): string {
  if (ms < 1_000) {
    return `${Math.round(ms)} ms`;
  }
  if (ms < 60_000) {
    const s = ms / 1_000;
    // One decimal, but drop ".0" (e.g. "4.0 s" → "4 s")
    const formatted = s % 1 === 0 ? s.toFixed(0) : s.toFixed(1);
    return `${formatted} s`;
  }
  const totalSec = Math.round(ms / 1_000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1_000) return `${tokens}`;
  const thousands = tokens / 1_000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(/\.0$/, '')}k`;
}
