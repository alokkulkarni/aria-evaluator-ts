// src/lib/log-safe.ts
// Neutralises user-controlled values before they are written to a log line.
// Prevents log injection / forging (CR/LF and other control characters that
// could split a log line or inject fake entries — CWE-117 / CodeQL
// js/log-injection).

// Any Unicode control character (incl. CR, LF, TAB, DEL, C0/C1 ranges).
const CONTROL_CHARS = /\p{Cc}+/gu;

/**
 * Returns a single-line, control-character-free rendering of `value`, safe to
 * interpolate into a log message. Control characters collapse to a single
 * space; overly long values are truncated.
 */
export function sanitizeLogValue(value: unknown, maxLength = 256): string {
  const str = typeof value === 'string' ? value : String(value);
  const cleaned = str.replace(CONTROL_CHARS, ' ');
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}…` : cleaned;
}
