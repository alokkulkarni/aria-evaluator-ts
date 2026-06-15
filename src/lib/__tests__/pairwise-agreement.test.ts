import { describe, expect, it } from 'vitest';

import { pairwiseAgreement, type PairwiseChoice } from '../calibration.js';

type P = [PairwiseChoice, PairwiseChoice];

describe('pairwiseAgreement', () => {
  it('returns zeros for empty input', () => {
    expect(pairwiseAgreement([])).toEqual({
      sampleCount: 0,
      accuracy: 0,
      kappa: 0,
      tieRate: 0,
      totalItems: 0,
    });
  });

  it('perfect agreement → accuracy 1, kappa 1', () => {
    const pairs: P[] = [['A', 'A'], ['B', 'B'], ['A', 'A'], ['B', 'B']];
    const s = pairwiseAgreement(pairs);
    expect(s.sampleCount).toBe(4);
    expect(s.accuracy).toBe(1);
    expect(s.kappa).toBeCloseTo(1, 5);
    expect(s.tieRate).toBe(0);
  });

  it('excludes human ties from accuracy/kappa and reports tieRate', () => {
    const pairs: P[] = [['A', 'A'], ['B', 'B'], ['A', 'tie'], ['tie', 'tie']];
    const s = pairwiseAgreement(pairs);
    expect(s.totalItems).toBe(4);
    expect(s.sampleCount).toBe(2); // only the 2 decisive-human items
    expect(s.accuracy).toBe(1);
    expect(s.tieRate).toBe(0.5);
  });

  it('a judge tie on a decisive item counts as a miss', () => {
    const s = pairwiseAgreement([['tie', 'A'], ['A', 'A']] as P[]);
    expect(s.sampleCount).toBe(2);
    expect(s.accuracy).toBe(0.5);
  });

  it('chance agreement → kappa near 0', () => {
    const pairs: P[] = [['A', 'A'], ['A', 'B'], ['A', 'A'], ['A', 'B']];
    const s = pairwiseAgreement(pairs);
    expect(s.accuracy).toBe(0.5);
    expect(s.kappa).toBeCloseTo(0, 5);
  });
});
