import { describe, expect, it } from 'vitest';

import { getRecommendations, getUniversalBaseline } from './engine.js';
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

describe('getUniversalBaseline', () => {
  it('returns a non-empty, verified (curated) set with a REQUIRED tier, sorted by severity', () => {
    const recs = getUniversalBaseline({});

    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((r) => r.source === 'curated')).toBe(true);
    expect(recs.some((r) => r.severity === 'REQUIRED')).toBe(true);
    expect(recs.map((r) => r.id)).toContain('universal-prompt-injection-resistance');
    for (let i = 0; i < recs.length - 1; i++) {
      expect(SEVERITY_RANK[recs[i]!.severity]).toBeLessThanOrEqual(SEVERITY_RANK[recs[i + 1]!.severity]);
    }
  });

  it('applies answer-driven augments (GDPR for EU) on top of the baseline', () => {
    const base = getUniversalBaseline({});
    const eu = getUniversalBaseline({ jurisdiction: 'EU' });
    expect(eu.length).toBeGreaterThan(base.length);
    expect(eu.map((r) => r.id)).toContain('gdpr-data-subject-rights');
  });

  it('skips the generic disclosure/data augments the baseline already covers (avoids duplicate cards)', () => {
    const recs = getUniversalBaseline({
      'user-facing': 'customers',
      'pii-types': ['ssn'],
      jurisdiction: 'EU',
    });
    const ids = recs.map((r) => r.id);
    // Generic augments are skipped — the baseline already covers disclosure + data protection.
    expect(ids).not.toContain('ai-disclosure-to-users');
    expect(ids).not.toContain('sensitive-data-controls-augment');
    // The baseline's own generic guardrails are present…
    expect(ids).toContain('universal-ai-disclosure');
    expect(ids).toContain('universal-sensitive-data-protection');
    // …and jurisdiction augments (additive legal specifics) still apply.
    expect(ids).toContain('gdpr-data-subject-rights');
  });

  it('is well-formed: every guardrail carries at least one citation', () => {
    for (const r of getUniversalBaseline({})) {
      expect(r.regulations.length).toBeGreaterThan(0);
    }
  });
});

describe('getRecommendations — answer-driven tailoring', () => {
  it('changes the recommendation set when the autonomy answer changes', async () => {
    const informational = await getRecommendations('banking', 'wealth-advisory', {
      'autonomy-level': 'read-only',
    });
    const autonomous = await getRecommendations('banking', 'wealth-advisory', {
      'autonomy-level': 'transactional',
    });
    // Autonomous execution must add a human-in-the-loop guardrail the read-only case lacks.
    expect(autonomous.length).toBeGreaterThan(informational.length);
    expect(informational.map((r) => r.id)).not.toContain('human-approval-before-execution');
    expect(autonomous.map((r) => r.id)).toContain('human-approval-before-execution');
  });

  it('adds region-specific guardrails that differ by jurisdiction', async () => {
    const uk = await getRecommendations('banking', 'wealth-advisory', { jurisdiction: 'UK' });
    const us = await getRecommendations('banking', 'wealth-advisory', { jurisdiction: 'US' });
    const eu = await getRecommendations('banking', 'wealth-advisory', { jurisdiction: 'EU' });

    expect(uk.map((r) => r.id)).toContain('uk-data-protection');
    expect(us.map((r) => r.id)).toContain('us-privacy-consumer-protection');
    expect(eu.map((r) => r.id)).toContain('gdpr-data-subject-rights');
    // Each jurisdiction yields a distinct set.
    expect(uk.map((r) => r.id)).not.toContain('us-privacy-consumer-protection');
    expect(us.map((r) => r.id)).not.toContain('uk-data-protection');
  });

  it('adds a data-protection guardrail when sensitive data types are selected', async () => {
    const none = await getRecommendations('banking', 'wealth-advisory', {
      'data-types': ['none'],
    });
    const sensitive = await getRecommendations('banking', 'wealth-advisory', {
      'data-types': ['ssn', 'account-numbers'],
    });
    expect(none.map((r) => r.id)).not.toContain('sensitive-data-controls-augment');
    expect(sensitive.map((r) => r.id)).toContain('sensitive-data-controls-augment');
  });

  it('expands well beyond the base set for a fully-specified customer-facing agent', async () => {
    const base = await getRecommendations('banking', 'wealth-advisory', {});
    const tailored = await getRecommendations('banking', 'wealth-advisory', {
      jurisdiction: 'UK',
      'user-facing': 'customers',
      'data-types': ['account-numbers', 'income'],
      'autonomy-level': 'transactional',
    });
    expect(base.length).toBeGreaterThanOrEqual(4); // the curated wealth-advisory base
    expect(tailored.length).toBeGreaterThan(base.length);
    // Still well-formed + still ordered by severity.
    for (const r of tailored) {
      expect(r.regulations.length).toBeGreaterThan(0);
    }
    for (let i = 0; i < tailored.length - 1; i++) {
      expect(SEVERITY_RANK[tailored[i]!.severity]).toBeLessThanOrEqual(SEVERITY_RANK[tailored[i + 1]!.severity]);
    }
  });

  it('recognises natural-language answer values an LLM might emit (not just canonical ids)', async () => {
    // Keys are arbitrary (the engine scans values, not ids); values are full labels.
    const recs = await getRecommendations('banking', 'wealth-advisory', {
      'q-region': 'United Kingdom',
      'q-users': 'Mixed user base',
      'q-data': ['Account numbers and balances', 'Income and asset details'],
      'q-autonomy': 'Autonomous execution of trades/transfers',
    });
    const ids = recs.map((r) => r.id);
    expect(ids).toContain('uk-data-protection');
    expect(ids).toContain('human-approval-before-execution');
    expect(ids).toContain('sensitive-data-controls-augment');
    expect(recs.length).toBeGreaterThan(6);
  });

  it('does not add a data-controls guardrail for a "no sensitive data" answer', async () => {
    const recs = await getRecommendations('banking', 'wealth-advisory', {
      'q-data': 'No sensitive data processed',
    });
    expect(recs.map((r) => r.id)).not.toContain('sensitive-data-controls-augment');
  });
});
