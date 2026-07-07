import { describe, expect, it } from 'vitest';

import {
  DIMENSION_RISK_CATEGORY,
  RISK_DIMENSION_IDS,
  normalizeRiskInsight,
  mergeRiskInsights,
} from '../risk-insights.js';

describe('DIMENSION_RISK_CATEGORY', () => {
  it('maps bias and hallucination dimensions', () => {
    expect(DIMENSION_RISK_CATEGORY['bias_and_fairness']).toBe('bias');
    expect(DIMENSION_RISK_CATEGORY['correctness']).toBe('hallucination');
    expect(DIMENSION_RISK_CATEGORY['faithfulness']).toBe('hallucination');
    expect(RISK_DIMENSION_IDS).toEqual(
      expect.arrayContaining(['bias_and_fairness', 'correctness', 'faithfulness']),
    );
  });
});

describe('normalizeRiskInsight', () => {
  it('returns undefined for missing / non-object raw', () => {
    expect(normalizeRiskInsight('bias', undefined)).toBeUndefined();
    expect(normalizeRiskInsight('bias', null)).toBeUndefined();
  });

  it('returns undefined when detected is explicitly false', () => {
    expect(
      normalizeRiskInsight('bias', { detected: false, reasons: ['x'], suggestions: ['y'] }),
    ).toBeUndefined();
  });

  it('returns undefined when there is nothing actionable', () => {
    expect(normalizeRiskInsight('bias', { detected: true, reasons: [], suggestions: [] })).toBeUndefined();
    // literal null/none strings are stripped as empty
    expect(
      normalizeRiskInsight('bias', { detected: true, reasons: ['null'], suggestions: ['N/A'] }),
    ).toBeUndefined();
  });

  it('builds an insight with cleaned, de-duplicated reasons + suggestions', () => {
    const insight = normalizeRiskInsight('bias', {
      detected: true,
      severity: 'HIGH',
      reasons: ['  Used postcode as a proxy  ', 'Used postcode as a proxy', ''],
      suggestions: ['Strip demographic proxies'],
      quotes: ['your area is high risk'],
    });
    expect(insight).toEqual({
      category: 'bias',
      detected: true,
      severity: 'high',
      reasons: ['Used postcode as a proxy'],
      suggestions: ['Strip demographic proxies'],
      evidenceQuotes: ['your area is high risk'],
    });
  });

  it('defaults severity to medium and accepts a single string field', () => {
    const insight = normalizeRiskInsight('hallucination', {
      detected: true,
      reasons: 'Invented an APR of 3.2%',
      suggestions: 'Only cite retrieved rates',
    });
    expect(insight?.severity).toBe('medium');
    expect(insight?.reasons).toEqual(['Invented an APR of 3.2%']);
    expect(insight?.evidenceQuotes).toBeUndefined();
  });
});

describe('mergeRiskInsights', () => {
  it('returns undefined when no turn produced an insight', () => {
    expect(mergeRiskInsights('hallucination', [undefined, undefined])).toBeUndefined();
  });

  it('unions reasons, takes the max severity, and de-duplicates', () => {
    const merged = mergeRiskInsights('hallucination', [
      normalizeRiskInsight('hallucination', {
        detected: true,
        severity: 'low',
        reasons: ['Invented a fee'],
        suggestions: ['Ground in retrieved data'],
      }),
      normalizeRiskInsight('hallucination', {
        detected: true,
        severity: 'high',
        reasons: ['Contradicted earlier balance', 'Invented a fee'],
        suggestions: ['Ground in retrieved data'],
        quotes: ['balance is £500'],
      }),
    ]);
    expect(merged?.severity).toBe('high');
    expect(merged?.reasons).toEqual(['Invented a fee', 'Contradicted earlier balance']);
    expect(merged?.suggestions).toEqual(['Ground in retrieved data']);
    expect(merged?.evidenceQuotes).toEqual(['balance is £500']);
  });
});
