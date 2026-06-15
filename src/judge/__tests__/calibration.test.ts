import { describe, expect, it } from 'vitest';

import {
  classifyTrust,
  cohenKappaBinary,
  computeCalibrationStats,
  exactAgreement,
  meanAbsError,
  quadraticWeightedKappa,
  weightForCalibration,
  withinOneRate,
  type ScorePair,
} from '../../lib/calibration.js';

describe('quadraticWeightedKappa', () => {
  it('is 1 for perfect agreement on varied scores', () => {
    const pairs: ScorePair[] = [[2, 2], [8, 8], [5, 5], [10, 10]];
    expect(quadraticWeightedKappa(pairs)).toBeCloseTo(1, 6);
  });

  it('is strongly negative for inverse agreement', () => {
    const pairs: ScorePair[] = [[0, 10], [10, 0]];
    expect(quadraticWeightedKappa(pairs)).toBeLessThan(-0.5);
  });

  it('is high but < 1 for near-miss agreement', () => {
    const pairs: ScorePair[] = [[8, 9], [7, 8], [2, 3], [9, 10], [4, 5]];
    const k = quadraticWeightedKappa(pairs);
    expect(k).toBeGreaterThan(0.7);
    expect(k).toBeLessThan(1);
  });

  it('returns 0 for empty input', () => {
    expect(quadraticWeightedKappa([])).toBe(0);
  });
});

describe('cohenKappaBinary', () => {
  it('is 1 when pass/fail always agree', () => {
    const pairs: ScorePair[] = [[8, 9], [2, 1], [7, 6], [3, 4]]; // both sides agree on ≥6
    expect(cohenKappaBinary(pairs)).toBeCloseTo(1, 6);
  });

  it('drops when pass/fail disagree', () => {
    const pairs: ScorePair[] = [[8, 2], [2, 8], [8, 2], [2, 8]];
    expect(cohenKappaBinary(pairs)).toBeLessThan(0);
  });
});

describe('agreement helpers', () => {
  const pairs: ScorePair[] = [[8, 9], [5, 7], [3, 3]];
  it('withinOneRate counts |Δ|≤1', () => {
    expect(withinOneRate(pairs)).toBeCloseTo(2 / 3, 6);
  });
  it('exactAgreement counts equal rounded scores', () => {
    expect(exactAgreement(pairs)).toBeCloseTo(1 / 3, 6);
  });
  it('meanAbsError averages |Δ|', () => {
    expect(meanAbsError(pairs)).toBeCloseTo((1 + 2 + 0) / 3, 6);
  });
});

describe('classifyTrust', () => {
  it('is insufficient below the min sample size', () => {
    expect(classifyTrust(0.95, 5)).toBe('insufficient');
  });
  it('applies the article thresholds above the sample floor', () => {
    expect(classifyTrust(0.85, 30)).toBe('trusted');
    expect(classifyTrust(0.7, 30)).toBe('supplementary');
    expect(classifyTrust(0.4, 30)).toBe('blocked');
  });
});

describe('weightForCalibration', () => {
  it('excludes blocked, neutralises insufficient, weights by within-1 otherwise', () => {
    expect(weightForCalibration({ trust: 'blocked', withinOneRate: 0.9 })).toBe(0);
    expect(weightForCalibration({ trust: 'insufficient', withinOneRate: 0.2 })).toBe(1);
    expect(weightForCalibration({ trust: 'trusted', withinOneRate: 0.92 })).toBeCloseTo(0.92, 6);
  });
});

describe('computeCalibrationStats', () => {
  it('bundles all metrics', () => {
    const stats = computeCalibrationStats([[8, 8], [6, 7]]);
    expect(stats.sampleCount).toBe(2);
    expect(stats.weightedKappa).toBeGreaterThan(0);
    expect(stats.withinOneRate).toBe(1);
  });
});
