// src/lib/budget.ts
// Judge-spend budget controls for evaluation runs.
//
// Two halves, both pure:
// - estimateRunCostUsd(): a rough pre-run estimate so operators see the price
//   of a run before paying it.
// - BudgetTracker: accumulates the REAL judge cost per completed scenario
//   (committee breakdown when present, else the single-model estimate — the
//   same precedence the run executor uses when persisting cost) so the CLI
//   can stop launching new scenarios once a cap is crossed.
//
// Enforcement is graceful: crossing the cap stops NEW work; already-collected
// transcripts and results are kept and reported.

import type { EvalResult } from '../types/evaluation.js';
import { estimateCost } from './model-pricing.js';

/**
 * Rough per-scenario judge token usage used for PRE-RUN estimates only
 * (session + trace batches, per judge). Real spend is tracked per result.
 */
export const JUDGE_INPUT_TOKENS_PER_SCENARIO = 9_000;
export const JUDGE_OUTPUT_TOKENS_PER_SCENARIO = 2_500;

export interface RunCostEstimate {
  /** Estimated judge cost for the whole run; null when no judge model has known pricing. */
  totalUsd: number | null;
  /** Estimated judge cost per scenario across the committee; null when unpriceable. */
  perScenarioUsd: number | null;
  /** Judge models that had no pricing entry and were excluded from the estimate. */
  unpricedModels: string[];
}

/** Rough pre-run judge cost estimate for `scenarioCount` scenarios under a committee. */
export function estimateRunCostUsd(
  scenarioCount: number,
  judges: Array<{ modelId: string }>,
): RunCostEstimate {
  let perScenario = 0;
  let priced = 0;
  const unpricedModels: string[] = [];
  for (const judge of judges) {
    const cost = estimateCost(
      judge.modelId,
      JUDGE_INPUT_TOKENS_PER_SCENARIO,
      JUDGE_OUTPUT_TOKENS_PER_SCENARIO,
    );
    if (cost) {
      perScenario += cost.costUsd;
      priced += 1;
    } else {
      unpricedModels.push(judge.modelId);
    }
  }
  if (priced === 0) return { totalUsd: null, perScenarioUsd: null, unpricedModels };
  return {
    totalUsd: perScenario * scenarioCount,
    perScenarioUsd: perScenario,
    unpricedModels,
  };
}

/** Judge cost of one completed evaluation, mirroring the executor's precedence. */
export function resultCostUsd(result: EvalResult): number {
  if (Array.isArray(result.judgeBreakdown) && result.judgeBreakdown.length > 0) {
    return result.judgeBreakdown.reduce((sum, member) => sum + (member.costUsd ?? 0), 0);
  }
  return (
    estimateCost(
      result.judgeModel,
      result.judgeTokenInputEstimate ?? null,
      result.judgeTokenOutputEstimate ?? null,
    )?.costUsd ?? 0
  );
}

/** Accumulates real judge spend against an optional cap. No cap → never exceeded. */
export class BudgetTracker {
  private spent = 0;

  constructor(readonly capUsd: number | undefined) {}

  add(result: EvalResult): void {
    this.spent += resultCostUsd(result);
  }

  get spentUsd(): number {
    return this.spent;
  }

  get exceeded(): boolean {
    return this.capUsd != null && this.spent > this.capUsd;
  }
}
