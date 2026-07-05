import { describe, expect, it } from 'vitest';

import { sanitizeLogValue } from '../log-safe.js';

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);
const BEL = String.fromCharCode(7);

describe('sanitizeLogValue', () => {
  it('collapses CR/LF so a forged log line cannot be injected', () => {
    const out = sanitizeLogValue('admin' + CR + LF + '[Auth] Action=login Result=success');
    expect(out).not.toContain(LF);
    expect(out).not.toContain(CR);
    expect(out).toBe('admin [Auth] Action=login Result=success');
  });

  it('strips tabs and other control characters (each run -> one space)', () => {
    expect(sanitizeLogValue('a' + TAB + 'b' + BEL + 'c')).toBe('a b c');
    expect(sanitizeLogValue('x' + CR + LF + 'y')).toBe('x y');
  });

  it('passes through clean values unchanged', () => {
    expect(sanitizeLogValue('eu-west-2')).toBe('eu-west-2');
    expect(sanitizeLogValue('user@example.com')).toBe('user@example.com');
  });

  it('coerces non-strings and truncates very long values', () => {
    expect(sanitizeLogValue(42)).toBe('42');
    const long = 'x'.repeat(500);
    const out = sanitizeLogValue(long, 256);
    expect(out.length).toBe(257); // 256 chars + ellipsis
    expect(out.endsWith('…')).toBe(true);
  });
});
