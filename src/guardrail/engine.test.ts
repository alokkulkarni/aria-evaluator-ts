import { describe, expect, it } from 'vitest';

import { getRecommendations } from './engine.js';
import type { GuardrailSeverity } from './types.js';

const SEVERITY_RANK: Record<GuardrailSeverity, number> = {
  REQUIRED: 0,
  RECOMMENDED: 1,
  OPTIONAL: 2,
};

describe('getRecommendations', () => {
  it('returns the REQUIRED guardrails for banking:customer-support', async () => {
    const recs = await getRecommendations('banking', 'customer-support', {});

    const required = recs.filter((r) => r.severity === 'REQUIRED');
    expect(required.length).toBeGreaterThanOrEqual(3);
    expect(required.map((r) => r.id)).toContain('topic-denial-financial-advice');

    for (const r of recs) {
      expect(r.guardrailType).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.description).toBeTruthy();
      expect(Array.isArray(r.regulations)).toBe(true);
    }
  });

  it('augments results with GDPR-specific entries when jurisdiction = EU', async () => {
    const baseline = await getRecommendations('banking', 'customer-support', {});
    const withEu = await getRecommendations('banking', 'customer-support', { jurisdiction: 'EU' });

    expect(withEu.length).toBeGreaterThan(baseline.length);
    expect(withEu.map((r) => r.id)).toContain('gdpr-data-subject-rights');
    expect(withEu.some((r) => r.regulations.some((reg) => reg.includes('GDPR')))).toBe(true);
    // The augmentation does not fire for a non-EU jurisdiction.
    const withUs = await getRecommendations('banking', 'customer-support', { jurisdiction: 'US' });
    expect(withUs.map((r) => r.id)).not.toContain('gdpr-data-subject-rights');
  });

  it('orders recommendations REQUIRED → RECOMMENDED → OPTIONAL', async () => {
    const recs = await getRecommendations('banking', 'customer-support', { jurisdiction: ['EU'] });

    expect(recs.length).toBeGreaterThan(1);
    for (let i = 0; i < recs.length - 1; i++) {
      expect(SEVERITY_RANK[recs[i]!.severity]).toBeLessThanOrEqual(SEVERITY_RANK[recs[i + 1]!.severity]);
    }
  });

  it('returns an empty array for an unknown domain:subFunction', async () => {
    const recs = await getRecommendations('unknown', 'nope', {});
    expect(recs).toEqual([]);
  });
});
