import { describe, expect, it } from 'vitest';

import { detectJudgeDrift, predominantHash } from '../../lib/judge-drift.js';
import { assessVendorDiversity } from '../../shared/judge-committee.js';

describe('detectJudgeDrift', () => {
  it('reports no drift when all runs match the baseline hash', () => {
    const r = detectJudgeDrift('abc', ['abc', 'abc', null]);
    expect(r.detected).toBe(false);
    expect(r.mismatchedHashes).toEqual([]);
    expect(r.baselineHash).toBe('abc');
  });

  it('detects drift and lists distinct mismatching hashes', () => {
    const r = detectJudgeDrift('abc', ['abc', 'def', 'def', 'ghi']);
    expect(r.detected).toBe(true);
    expect(r.mismatchedHashes.sort()).toEqual(['def', 'ghi']);
  });

  it('cannot assess drift without a baseline hash (pre-Phase-1 baseline)', () => {
    const r = detectJudgeDrift(null, ['abc']);
    expect(r.detected).toBe(false);
    expect(r.baselineHash).toBeNull();
  });
});

describe('predominantHash', () => {
  it('returns the most common non-null hash', () => {
    expect(predominantHash(['a', 'b', 'b', null, 'b', 'a'])).toBe('b');
  });

  it('returns null when there are no hashes', () => {
    expect(predominantHash([null, undefined])).toBeNull();
  });
});

describe('assessVendorDiversity', () => {
  it('flags a single-vendor committee as not cross-vendor', () => {
    const d = assessVendorDiversity([
      { provider: 'bedrock', modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0' },
      { provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
    ]);
    expect(d.vendorCount).toBe(1); // both anthropic family
    expect(d.crossVendor).toBe(false);
  });

  it('recognises a cross-vendor committee', () => {
    const d = assessVendorDiversity([
      { provider: 'bedrock', modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0' },
      { provider: 'openai', modelId: 'gpt-4o' },
      { provider: 'bedrock', modelId: 'amazon.nova-pro-v1:0' },
    ]);
    expect(d.vendors.sort()).toEqual(['amazon', 'anthropic', 'openai']);
    expect(d.crossVendor).toBe(true);
  });
});
