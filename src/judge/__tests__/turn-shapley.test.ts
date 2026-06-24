import { describe, it, expect } from 'vitest';

import type { Transcript } from '../../types/transcript.js';
import { computeTurnShapley } from '../explain/turn-shapley.js';

function mkTranscript(contents: Array<{ role: 'customer' | 'agent'; content: string }>): Transcript {
  return {
    id: 'run-1',
    scenarioName: 'test',
    channel: 'chat',
    startedAt: '2026-01-01T00:00:00.000Z',
    escalated: false,
    turns: contents.map((c, i) => ({ index: i, role: c.role, content: c.content, timestampMs: i })),
  };
}

const PLACEHOLDER = '[turn omitted]';

describe('computeTurnShapley', () => {
  it('attributes an additive game exactly (sum of values == full − baseline)', async () => {
    const transcript = mkTranscript([
      { role: 'customer', content: 'C0' },
      { role: 'agent', content: 'A1' },
      { role: 'agent', content: 'A2' },
      { role: 'agent', content: 'A3' },
    ]);
    // Attribute over the three agent turns (positions 1,2,3).
    const attributablePositions = [1, 2, 3];
    // Additive value: each present agent turn adds a fixed weight. For an additive
    // game the Shapley value equals each player's own weight.
    const weights: Record<number, number> = { 1: 2, 2: 6, 3: 2 };
    const score = async (t: Transcript): Promise<number> => {
      let v = 0;
      for (const pos of attributablePositions) {
        if (t.turns[pos]!.content !== PLACEHOLDER) v += weights[pos]!;
      }
      return v;
    };

    const exp = await computeTurnShapley({
      transcript,
      attributablePositions,
      dimensionId: 'guardrail_compliance',
      judgeModel: 'test.model',
      temperature: 0,
      score,
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(exp.exact).toBe(true);
    expect(exp.baselineScore).toBe(0);
    expect(exp.fullScore).toBe(10);
    expect(exp.turns.map((t) => t.turnIndex)).toEqual([1, 2, 3]);

    const values = exp.turns.map((t) => t.value);
    expect(values[0]).toBeCloseTo(2, 5);
    expect(values[1]).toBeCloseTo(6, 5);
    expect(values[2]).toBeCloseTo(2, 5);

    const sum = values.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(exp.fullScore - exp.baselineScore, 5);
  });

  it('isolates the single turn responsible for a guardrail breach', async () => {
    const transcript = mkTranscript([
      { role: 'agent', content: 'safe-1' },
      { role: 'agent', content: 'LEAK' }, // the breaching turn
      { role: 'agent', content: 'safe-2' },
    ]);
    const attributablePositions = [0, 1, 2];
    // Full conversation scores 0 (breach present). Removing the breaching turn (1)
    // restores a perfect 10; the other turns don't matter.
    const score = async (t: Transcript): Promise<number> =>
      t.turns[1]!.content === 'LEAK' ? 0 : 10;

    const exp = await computeTurnShapley({
      transcript,
      attributablePositions,
      dimensionId: 'guardrail_compliance',
      judgeModel: 'test.model',
      temperature: 0,
      score,
      now: '2026-01-01T00:00:00.000Z',
    });

    expect(exp.baselineScore).toBe(10); // all masked → no breach
    expect(exp.fullScore).toBe(0);       // breach present
    const breaching = exp.turns.find((t) => t.turnIndex === 1)!;
    // The breaching turn carries essentially all of the −10 swing.
    expect(breaching.value).toBeCloseTo(-10, 5);
    expect(exp.turns.find((t) => t.turnIndex === 0)!.value).toBeCloseTo(0, 5);
    expect(exp.turns.find((t) => t.turnIndex === 2)!.value).toBeCloseTo(0, 5);
  });
});
