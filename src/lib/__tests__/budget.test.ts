// Budget controls — pure-module tests.
//
// Pre-run estimates use rough per-scenario token constants; enforcement uses
// the real per-result judge cost (committee breakdown when present, else the
// single-model estimate — same precedence as the run executor).

import { describe, expect, it } from 'vitest';

import {
  BudgetTracker,
  JUDGE_INPUT_TOKENS_PER_SCENARIO,
  JUDGE_OUTPUT_TOKENS_PER_SCENARIO,
  estimateRunCostUsd,
} from '../budget.js';
import { estimateCost } from '../model-pricing.js';
import type { EvalResult } from '../../types/evaluation.js';

const SONNET = 'anthropic.claude-sonnet-4-5-20250929-v1:0';

function result(overrides: Partial<EvalResult>): EvalResult {
  return {
    runId: 'r',
    scenarioName: 's',
    overallScore: 8,
    passed: true,
    dimensionScores: {},
    summary: '',
    judgeModel: SONNET,
    evaluatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as EvalResult;
}

describe('estimateRunCostUsd', () => {
  it('scales with scenario count and judge count for known models', () => {
    const one = estimateRunCostUsd(1, [{ modelId: SONNET }]);
    expect(one.totalUsd).not.toBeNull();
    expect(one.totalUsd!).toBeGreaterThan(0);
    expect(one.totalUsd).toBeCloseTo(
      estimateCost(SONNET, JUDGE_INPUT_TOKENS_PER_SCENARIO, JUDGE_OUTPUT_TOKENS_PER_SCENARIO)!.costUsd,
      6,
    );

    const ten = estimateRunCostUsd(10, [{ modelId: SONNET }, { modelId: SONNET }]);
    expect(ten.totalUsd).toBeCloseTo(one.totalUsd! * 20, 6);
  });

  it('returns null totals when no judge model has known pricing', () => {
    const est = estimateRunCostUsd(5, [{ modelId: 'unknown.model-v9' }]);
    expect(est.totalUsd).toBeNull();
    expect(est.perScenarioUsd).toBeNull();
  });

  it('skips unknown models but still prices the known ones', () => {
    const est = estimateRunCostUsd(2, [{ modelId: SONNET }, { modelId: 'unknown.model-v9' }]);
    const known = estimateRunCostUsd(2, [{ modelId: SONNET }]);
    expect(est.totalUsd).toBeCloseTo(known.totalUsd!, 6);
  });
});

describe('BudgetTracker', () => {
  it('accumulates committee breakdown costs and flips exceeded at the cap', () => {
    const tracker = new BudgetTracker(0.05);
    const withBreakdown = result({
      judgeBreakdown: [
        { judgeId: 'a', provider: 'bedrock', modelId: SONNET, inputTokens: 1, outputTokens: 1, costUsd: 0.03 },
        { judgeId: 'b', provider: 'openai', modelId: 'gpt-4o', inputTokens: 1, outputTokens: 1, costUsd: 0.01 },
      ],
    });
    tracker.add(withBreakdown);
    expect(tracker.spentUsd).toBeCloseTo(0.04, 6);
    expect(tracker.exceeded).toBe(false);

    tracker.add(withBreakdown);
    expect(tracker.spentUsd).toBeCloseTo(0.08, 6);
    expect(tracker.exceeded).toBe(true);
  });

  it('falls back to the single-model estimate when no breakdown is present', () => {
    const tracker = new BudgetTracker(10);
    tracker.add(result({ judgeTokenInputEstimate: 10_000, judgeTokenOutputEstimate: 2_000 }));
    expect(tracker.spentUsd).toBeCloseTo(estimateCost(SONNET, 10_000, 2_000)!.costUsd, 6);
  });

  it('never exceeds without a cap and ignores unpriceable results safely', () => {
    const tracker = new BudgetTracker(undefined);
    tracker.add(result({ judgeModel: 'unknown.model-v9' })); // no tokens, no breakdown
    expect(tracker.spentUsd).toBe(0);
    expect(tracker.exceeded).toBe(false);
  });
});
