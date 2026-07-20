import { describe, expect, it } from 'vitest';

import { bucketScenarioTrend, type ScenarioTrendRow } from '../scenario-trends.js';

const NOW = new Date('2026-07-20T12:00:00Z');

function row(overrides: Partial<ScenarioTrendRow> = {}): ScenarioTrendRow {
  return {
    completedAt: new Date('2026-07-18T10:00:00Z'),
    overallScore: 8,
    passed: true,
    dimensionScores: JSON.stringify({ helpfulness: { score: 8 }, accuracy: { score: 7 } }),
    ...overrides,
  };
}

describe('bucketScenarioTrend', () => {
  it('returns empty trend and dimensions for empty input', () => {
    expect(bucketScenarioTrend([], 30, NOW)).toEqual({ trend: [], dimensions: [] });
  });

  it('buckets runs by UTC day, sorted ascending, with zero-padded dates', () => {
    const rows = [
      row({ completedAt: new Date('2026-07-09T08:00:00Z') }),
      row({ completedAt: new Date('2026-07-09T21:30:00Z') }),
      row({ completedAt: new Date('2026-07-10T00:15:00Z') }),
    ];
    const { trend } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend.map((p) => p.date)).toEqual(['2026-07-09', '2026-07-10']);
    expect(trend.map((p) => p.runs)).toEqual([2, 1]);
  });

  it('splits runs either side of UTC midnight into separate buckets', () => {
    const rows = [
      row({ completedAt: new Date('2026-07-15T23:59:59Z') }),
      row({ completedAt: new Date('2026-07-16T00:00:01Z') }),
    ];
    const { trend } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend.map((p) => p.date)).toEqual(['2026-07-15', '2026-07-16']);
  });

  it('computes passRate (0-1) and avgScore (0-10) per day', () => {
    const day = new Date('2026-07-18T09:00:00Z');
    const rows = [
      row({ completedAt: day, passed: true, overallScore: 9 }),
      row({ completedAt: day, passed: true, overallScore: 8 }),
      row({ completedAt: day, passed: false, overallScore: 4 }),
    ];
    const { trend } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend).toHaveLength(1);
    expect(trend[0]!.passRate).toBeCloseTo(2 / 3, 3);
    expect(trend[0]!.avgScore).toBe(7);
  });

  it('rounds passRate to 4dp and scores to 2dp', () => {
    const day = new Date('2026-07-18T09:00:00Z');
    const rows = [
      row({ completedAt: day, passed: true, overallScore: 7 }),
      row({ completedAt: day, passed: false, overallScore: 8 }),
      row({ completedAt: day, passed: false, overallScore: 8 }),
    ];
    const { trend } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend[0]!.passRate).toBe(0.3333);
    expect(trend[0]!.avgScore).toBe(7.67);
  });

  it('averages dimensions per day and unions dimension ids across the window, sorted', () => {
    const rows = [
      row({
        completedAt: new Date('2026-07-17T10:00:00Z'),
        dimensionScores: JSON.stringify({ helpfulness: { score: 6 }, clarity: { score: 8 } }),
      }),
      row({
        completedAt: new Date('2026-07-17T11:00:00Z'),
        dimensionScores: JSON.stringify({ helpfulness: { score: 8 } }),
      }),
      row({
        completedAt: new Date('2026-07-18T10:00:00Z'),
        dimensionScores: JSON.stringify({ accuracy: { score: 5 } }),
      }),
    ];
    const { trend, dimensions } = bucketScenarioTrend(rows, 30, NOW);
    expect(dimensions).toEqual(['accuracy', 'clarity', 'helpfulness']);
    expect(trend[0]!.dimensionAvgs).toEqual({ helpfulness: 7, clarity: 8 });
    expect(trend[1]!.dimensionAvgs).toEqual({ accuracy: 5 });
  });

  it('silently skips malformed dimensionScores JSON but still counts the run', () => {
    const day = new Date('2026-07-18T09:00:00Z');
    const rows = [
      row({ completedAt: day, passed: true, overallScore: 9, dimensionScores: '{not json' }),
      row({ completedAt: day, passed: false, overallScore: 5, dimensionScores: JSON.stringify({ accuracy: { score: 6 } }) }),
    ];
    const { trend, dimensions } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend[0]!.runs).toBe(2);
    expect(trend[0]!.passRate).toBe(0.5);
    expect(trend[0]!.avgScore).toBe(7);
    expect(dimensions).toEqual(['accuracy']);
    expect(trend[0]!.dimensionAvgs).toEqual({ accuracy: 6 });
  });

  it('treats null dimensionScores and non-object JSON as having no dimensions', () => {
    const day = new Date('2026-07-18T09:00:00Z');
    const rows = [
      row({ completedAt: day, dimensionScores: null }),
      row({ completedAt: day, dimensionScores: 'null' }),
      row({ completedAt: day, dimensionScores: '[1,2]' }),
      row({ completedAt: day, dimensionScores: '"text"' }),
    ];
    const { trend, dimensions } = bucketScenarioTrend(rows, 30, NOW);
    expect(trend[0]!.runs).toBe(4);
    expect(trend[0]!.dimensionAvgs).toEqual({});
    expect(dimensions).toEqual([]);
  });

  it('ignores dimension entries without a numeric score', () => {
    const day = new Date('2026-07-18T09:00:00Z');
    const rows = [
      row({
        completedAt: day,
        dimensionScores: JSON.stringify({
          helpfulness: { score: 8 },
          broken: { score: 'high' },
          empty: {},
          nullish: null,
        }),
      }),
    ];
    const { trend, dimensions } = bucketScenarioTrend(rows, 30, NOW);
    expect(dimensions).toEqual(['helpfulness']);
    expect(trend[0]!.dimensionAvgs).toEqual({ helpfulness: 8 });
  });

  it('excludes rows older than the window', () => {
    const rows = [
      row({ completedAt: new Date('2026-07-10T11:59:00Z') }), // > 10 days before NOW
      row({ completedAt: new Date('2026-07-11T12:01:00Z') }), // inside 10-day window
    ];
    const { trend } = bucketScenarioTrend(rows, 10, NOW);
    expect(trend.map((p) => p.date)).toEqual(['2026-07-11']);
  });
});
