import { describe, expect, it } from 'vitest';

import { aggregateMemberScores, computeOverallAndPass, type MemberOutcome } from '../aggregate.js';
import type { DimensionScore, JudgeRef } from '../../types/evaluation.js';

const judgeA: JudgeRef = { id: 'a', provider: 'bedrock', modelId: 'claude' };
const judgeB: JudgeRef = { id: 'b', provider: 'openai', modelId: 'gpt-4o' };

function ds(score: number, justification = 'r'): DimensionScore {
  return { score, justification };
}

describe('aggregateMemberScores', () => {
  it('passes a single member through unchanged (no votes, no spread)', () => {
    const members: MemberOutcome[] = [
      { judge: judgeA, dimensionScores: { correctness: ds(8), clarity: ds(6) } },
    ];
    const { dimensionScores, judgeAgreement, requiresHumanReview } = aggregateMemberScores(members, 2);
    expect(dimensionScores.correctness!.score).toBe(8);
    expect(dimensionScores.correctness!.judgeVotes).toBeUndefined();
    expect(dimensionScores.correctness!.disagreement).toBeUndefined();
    expect(judgeAgreement).toBe(1);
    expect(requiresHumanReview).toBe(false);
  });

  it('averages two members and records votes + spread', () => {
    const members: MemberOutcome[] = [
      { judge: judgeA, dimensionScores: { correctness: ds(8) } },
      { judge: judgeB, dimensionScores: { correctness: ds(6) } },
    ];
    const { dimensionScores } = aggregateMemberScores(members, 2);
    expect(dimensionScores.correctness!.score).toBe(7); // mean of 8,6
    expect(dimensionScores.correctness!.spread).toBe(2);
    expect(dimensionScores.correctness!.judgeVotes).toHaveLength(2);
    // spread (2) is not > threshold (2) → no disagreement
    expect(dimensionScores.correctness!.disagreement).toBe(false);
  });

  it('flags disagreement + human review when spread exceeds threshold', () => {
    const members: MemberOutcome[] = [
      { judge: judgeA, dimensionScores: { guardrail_compliance: ds(10) } },
      { judge: judgeB, dimensionScores: { guardrail_compliance: ds(5) } },
    ];
    const { dimensionScores, requiresHumanReview, judgeAgreement } = aggregateMemberScores(members, 2);
    expect(dimensionScores.guardrail_compliance!.disagreement).toBe(true);
    expect(requiresHumanReview).toBe(true);
    expect(judgeAgreement).toBeLessThan(1); // spread 5 → 0.5
  });

  it('applies per-judge calibration weights to the mean', () => {
    const members: MemberOutcome[] = [
      { judge: judgeA, dimensionScores: { correctness: ds(10) } },
      { judge: judgeB, dimensionScores: { correctness: ds(2) } },
    ];
    // judgeA (id 'a') weighted 3×, judgeB (id 'b') 1× → (10*3 + 2*1)/4 = 8
    const { dimensionScores } = aggregateMemberScores(members, 5, { a: 3, b: 1 });
    expect(dimensionScores.correctness!.score).toBe(8);
    // spread is still raw (unweighted): 10 − 2 = 8
    expect(dimensionScores.correctness!.spread).toBe(8);
  });

  it('unions dimensions across members that scored different sets', () => {
    const members: MemberOutcome[] = [
      { judge: judgeA, dimensionScores: { correctness: ds(8) } },
      { judge: judgeB, dimensionScores: { clarity: ds(7) } },
    ];
    const { dimensionScores } = aggregateMemberScores(members, 2);
    expect(Object.keys(dimensionScores).sort()).toEqual(['clarity', 'correctness']);
    // each dim has a single vote → no votes attached
    expect(dimensionScores.correctness!.judgeVotes).toBeUndefined();
  });
});

describe('computeOverallAndPass', () => {
  it('quality scenarios average all dimensions', () => {
    const scores = { a: ds(8), b: ds(4) };
    const { overallScore, passed } = computeOverallAndPass(scores, false);
    expect(overallScore).toBe(6);
    expect(passed).toBe(true); // >= 6.0
  });

  it('security scenarios use only core security dimensions', () => {
    const scores = {
      guardrail_compliance: ds(9),
      prompt_injection_resistance: ds(9),
      conciseness: ds(1), // non-core, must NOT drag down a blocked attack
    };
    const { overallScore, passed } = computeOverallAndPass(scores, true);
    expect(overallScore).toBe(9);
    expect(passed).toBe(true);
  });
});
