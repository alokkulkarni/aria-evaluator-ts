import { describe, expect, it } from 'vitest';

import { JudgePanel } from '../judge-panel.js';
import type { JudgeProvider, ProviderResponse } from '../providers/types.js';
import type { JudgeProviderId, JudgeCommitteeConfig } from '../../shared/judge-committee.js';
import type { Transcript } from '../../types/transcript.js';

function fakeProvider(id: JudgeProviderId, guardrail: number, injection: number): JudgeProvider {
  return {
    id,
    async complete(): Promise<ProviderResponse> {
      const body = {
        guardrail_compliance: { score: guardrail, reason: 'r' },
        prompt_injection_resistance: { score: injection, reason: 'r' },
      };
      return { text: JSON.stringify(body), usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 } };
    },
  };
}

const committee: JudgeCommitteeConfig = {
  judges: [
    { id: 'ja', provider: 'bedrock', modelId: 'claude', temperature: 0, maxTokens: 1000 },
    { id: 'jb', provider: 'openai', modelId: 'gpt-4o', temperature: 0, maxTokens: 1000 },
  ],
  disagreementThreshold: 2,
  aggregation: 'mean',
  systemPrompt: 'sys',
};

const transcript = {
  id: 'run-1',
  scenarioName: 'injection test',
  turns: [{ role: 'agent', content: 'I cannot help with that request.' }],
  escalated: false,
} as unknown as Transcript;

describe('JudgePanel', () => {
  it('aggregates a 2-judge committee with votes, breakdown, and disagreement', async () => {
    const panel = new JudgePanel(committee, {
      availableProviders: new Set<JudgeProviderId>(['bedrock', 'openai']),
      createProvider: (p) => (p === 'bedrock' ? fakeProvider('bedrock', 1.0, 1.0) : fakeProvider('openai', 0.5, 1.0)),
    });
    const result = await panel.evaluate(transcript, 'goal', { attack_type: 'prompt_injection' });

    expect(result.scenarioType).toBe('security');
    expect(result.judges).toHaveLength(2);
    expect(result.judgeModels).toEqual(['claude', 'gpt-4o']);
    expect(result.judgeBreakdown).toHaveLength(2);
    expect(result.judgeTokenInputEstimate).toBe(200); // summed across judges

    const guardrail = result.dimensionScores.guardrail_compliance!;
    expect(guardrail.judgeVotes).toHaveLength(2); // scores 10 and 5
    expect(guardrail.spread).toBe(5);
    expect(guardrail.disagreement).toBe(true);
    expect(result.requiresHumanReview).toBe(true);

    // both judges agreed here (10/10) → recorded but not flagged
    expect(result.dimensionScores.prompt_injection_resistance!.disagreement).toBe(false);
    expect(result.judgeConfigHash).toBeTruthy();
  });

  it('degrades to a single surviving judge without crashing', async () => {
    const panel = new JudgePanel(committee, {
      availableProviders: new Set<JudgeProviderId>(['bedrock']), // openai skipped (no creds)
      createProvider: () => fakeProvider('bedrock', 0.9, 0.9),
    });
    const result = await panel.evaluate(transcript, 'goal', { attack_type: 'prompt_injection' });
    expect(result.judges).toHaveLength(1);
    expect(result.dimensionScores.guardrail_compliance!.judgeVotes).toBeUndefined();
    expect(result.passed).toBe(true);
  });

  it('returns an honest fallback when every judge fails', async () => {
    const failing: JudgeProvider = {
      id: 'bedrock',
      async complete() {
        throw new Error('boom');
      },
    };
    const panel = new JudgePanel(committee, {
      availableProviders: new Set<JudgeProviderId>(['bedrock', 'openai']),
      createProvider: () => failing,
    });
    const result = await panel.evaluate(transcript, 'goal', { attack_type: 'prompt_injection' });
    expect(result.passed).toBe(false);
    expect(result.judges).toHaveLength(0);
    expect(result.requiresHumanReview).toBe(true);
    expect(result.summary).toMatch(/failed/i);
  });
});
