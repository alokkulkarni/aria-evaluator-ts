// Judge scoring-consistency regression suite.
//
// Guards the invariants that keep repeated evaluations of the same transcript
// comparable:
//   1. normalizeJudgeScore — every raw model score lands on the shared rubric
//      anchor scale (0, 0.25, 0.5, 0.75, 1.0), including 0–10 scale repair.
//   2. Prompts are deterministic (byte-identical across runs) and carry the
//      rating-scale anchors for every dimension.
//   3. Judge temperature is capped at MAX_JUDGE_TEMPERATURE regardless of config.
//   4. Session-batch max_tokens scales with dimension count (a fixed 1200 cap
//      truncated 8-dimension batches → unparseable JSON → silent neutral scores).
//   5. An unparseable judge response is retried once before neutral fallback.
//   6. The full panel is deterministic given deterministic providers, and the
//      disagreement → requiresHumanReview escalation path still fires.
//
// The optional live probe (JUDGE_LIVE_CONSISTENCY=1) sends the same transcript
// through Bedrock twice and asserts per-dimension stability within ±1 point.

import { describe, expect, it } from 'vitest';

import {
  ESCALATION_DIMENSIONS,
  SESSION_DIMENSIONS,
  TRACE_DIMENSIONS,
  RATING_ANCHOR_VALUES,
  renderRatingScale,
  CORRECTNESS,
} from '../dimensions.js';
import { JudgeMember, normalizeJudgeScore } from '../llm-judge.js';
import { JudgePanel } from '../judge-panel.js';
import { BedrockJudgeProvider } from '../providers/bedrock.js';
import {
  clampJudgeTemperature,
  MAX_JUDGE_TEMPERATURE,
  DEFAULT_JUDGE_MODEL_ID,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
} from '../../shared/judge-config.js';
import type { JudgeCommitteeConfig, JudgeProviderId, JudgeSpec } from '../../shared/judge-committee.js';
import type { JudgeProvider, ProviderRequest, ProviderResponse } from '../providers/types.js';
import type { Transcript } from '../../types/transcript.js';

const transcript = {
  id: 'run-consistency',
  scenarioName: 'balance enquiry',
  turns: [
    { role: 'customer', content: 'Hi, what is my current account balance?' },
    { role: 'agent', content: 'Your current account balance is £1,250.40. Anything else I can help with?' },
  ],
  escalated: false,
} as unknown as Transcript;

/** Canned judge output covering session, trace (turn 1) and escalation keys. */
function universalBody(score: number): string {
  const body: Record<string, unknown> = {};
  for (const d of [...SESSION_DIMENSIONS, ...ESCALATION_DIMENSIONS]) {
    body[d.id] = { score, reason: 'r', evidence: 'e', gap: null };
  }
  for (const d of TRACE_DIMENSIONS) {
    body[`${d.id}__turn_1`] = { score, reason: 'r', evidence: 'e', gap: null };
  }
  return JSON.stringify(body);
}

/** Deterministic provider that records every request it receives. */
function recordingProvider(id: JudgeProviderId, score: number, requests: ProviderRequest[]): JudgeProvider {
  return {
    id,
    async complete(req: ProviderRequest): Promise<ProviderResponse> {
      requests.push(req);
      return { text: universalBody(score), usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    },
  };
}

function member(spec: Partial<JudgeSpec>, provider: JudgeProvider, temperature = 0): JudgeMember {
  return new JudgeMember(
    { id: 'j', provider: 'bedrock', modelId: 'claude', ...spec } as JudgeSpec,
    provider,
    { systemPrompt: 'sys', temperature, maxTokens: 1200 },
  );
}

describe('normalizeJudgeScore', () => {
  it('passes anchor values through unchanged', () => {
    for (const v of RATING_ANCHOR_VALUES) expect(normalizeJudgeScore(v)).toBe(v);
  });

  it('repairs 0–10 scale confusion (7 → 0.75 anchor)', () => {
    expect(normalizeJudgeScore(7)).toBe(0.75);
    expect(normalizeJudgeScore(10)).toBe(1);
    expect(normalizeJudgeScore(5)).toBe(0.5);
  });

  it('snaps off-anchor values to the nearest anchor', () => {
    expect(normalizeJudgeScore(0.6)).toBe(0.5);
    expect(normalizeJudgeScore(0.9)).toBe(1);
    expect(normalizeJudgeScore(0.3)).toBe(0.25);
    expect(normalizeJudgeScore(0.8)).toBe(0.75);
  });

  it('clamps out-of-range values', () => {
    expect(normalizeJudgeScore(-3)).toBe(0);
    expect(normalizeJudgeScore(42)).toBe(1);
  });

  it('coerces numeric strings and rejects non-numerics', () => {
    expect(normalizeJudgeScore('0.75')).toBe(0.75);
    expect(normalizeJudgeScore('abc')).toBeNull();
    expect(normalizeJudgeScore(null)).toBeNull();
    expect(normalizeJudgeScore(undefined)).toBeNull();
  });
});

describe('clampJudgeTemperature', () => {
  it('caps scoring temperature at MAX_JUDGE_TEMPERATURE', () => {
    expect(clampJudgeTemperature(0.9)).toBe(MAX_JUDGE_TEMPERATURE);
    expect(clampJudgeTemperature(0.1)).toBe(0.1);
    expect(clampJudgeTemperature(0)).toBe(0);
  });

  it('treats negative / non-finite values as 0', () => {
    expect(clampJudgeTemperature(-1)).toBe(0);
    expect(clampJudgeTemperature(Number.NaN)).toBe(0);
  });
});

describe('rating-scale anchors in prompts', () => {
  it('renderRatingScale emits every anchor value with its definition', () => {
    const text = renderRatingScale(CORRECTNESS);
    for (const level of CORRECTNESS.ratingScale) {
      expect(text).toContain(level.value.toFixed(2));
      expect(text).toContain(level.definition);
    }
  });

  it('session and trace prompts include anchors for every dimension evaluated', async () => {
    const requests: ProviderRequest[] = [];
    await member({}, recordingProvider('bedrock', 0.75, requests)).evaluate(transcript, 'check balance');

    const sessionPrompt = requests.map((r) => r.userPrompt).find((p) => p.includes('Scenario goal:'))!;
    const tracePrompt = requests.map((r) => r.userPrompt).find((p) => p.includes('agent turn(s) from a conversation'))!;
    expect(sessionPrompt).toBeTruthy();
    expect(tracePrompt).toBeTruthy();

    for (const d of SESSION_DIMENSIONS) {
      expect(sessionPrompt).toContain(`**${d.id}**`);
      expect(sessionPrompt).toContain(d.ratingScale[0]!.definition);
    }
    for (const d of TRACE_DIMENSIONS) {
      expect(tracePrompt).toContain(`**${d.id}**`);
      expect(tracePrompt).toContain(d.ratingScale[0]!.definition);
    }
    // Both prompts instruct anchor-only scoring.
    expect(sessionPrompt).toMatch(/exactly one of 0\.0, 0\.25, 0\.5, 0\.75 or 1\.0/i);
    expect(tracePrompt).toMatch(/exactly one of 0\.0, 0\.25, 0\.5, 0\.75 or 1\.0/i);
  });
});

describe('prompt + panel determinism', () => {
  it('produces byte-identical prompts and identical results across repeated runs', async () => {
    const runsA: ProviderRequest[] = [];
    const runsB: ProviderRequest[] = [];
    const resultA = await member({}, recordingProvider('bedrock', 0.75, runsA)).evaluate(transcript, 'check balance');
    const resultB = await member({}, recordingProvider('bedrock', 0.75, runsB)).evaluate(transcript, 'check balance');

    expect(runsA.map((r) => r.userPrompt).sort()).toEqual(runsB.map((r) => r.userPrompt).sort());
    expect(runsA.every((r) => r.temperature === 0)).toBe(true);
    expect(resultA.dimensionScores).toEqual(resultB.dimensionScores);
    expect(resultA.overallScore).toBe(resultB.overallScore);
    expect(resultA.passed).toBe(resultB.passed);
  });

  it('the committee panel is deterministic and still escalates on disagreement', async () => {
    const committee: JudgeCommitteeConfig = {
      judges: [
        { id: 'ja', provider: 'bedrock', modelId: 'claude', temperature: 0, maxTokens: 1200 },
        { id: 'jb', provider: 'openai', modelId: 'gpt-4o', temperature: 0, maxTokens: 1200 },
      ],
      disagreementThreshold: 2,
      aggregation: 'mean',
      systemPrompt: 'sys',
    };
    const mkPanel = () =>
      new JudgePanel(committee, {
        availableProviders: new Set<JudgeProviderId>(['bedrock', 'openai']),
        createProvider: (p) => recordingProvider(p, p === 'bedrock' ? 1.0 : 0.5, []),
      });

    const r1 = await mkPanel().evaluate(transcript, 'check balance');
    const r2 = await mkPanel().evaluate(transcript, 'check balance');

    expect(r1.dimensionScores).toEqual(r2.dimensionScores);
    expect(r1.overallScore).toBe(r2.overallScore);
    expect(r1.judgeAgreement).toBe(r2.judgeAgreement);
    // 10 vs 5 on every dimension: spread 5 > threshold 2 → human review still fires.
    expect(r1.requiresHumanReview).toBe(true);
  });
});

describe('temperature clamping in JudgeMember', () => {
  it('never sends a scoring temperature above MAX_JUDGE_TEMPERATURE', async () => {
    const requests: ProviderRequest[] = [];
    await member({ temperature: 0.9 }, recordingProvider('bedrock', 0.75, requests), 0.9)
      .evaluate(transcript, 'check balance');
    expect(requests.length).toBeGreaterThan(0);
    for (const r of requests) expect(r.temperature).toBeLessThanOrEqual(MAX_JUDGE_TEMPERATURE);
  });
});

describe('session batch output budget', () => {
  it('scales max_tokens with the number of dimensions instead of the fixed 1200 cap', async () => {
    const requests: ProviderRequest[] = [];
    await member({}, recordingProvider('bedrock', 0.75, requests)).evaluate(transcript, 'check balance');
    const session = requests.find((r) => r.userPrompt.includes('Scenario goal:'))!;
    // 8 session dimensions × ~260 output tokens each ≫ 1200.
    expect(session.maxTokens).toBeGreaterThanOrEqual(2000);
    expect(session.maxTokens).toBeLessThanOrEqual(4000);
  });
});

describe('unparseable judge output', () => {
  it('retries once with more output headroom, then succeeds', async () => {
    const calls: ProviderRequest[] = [];
    const flaky: JudgeProvider = {
      id: 'bedrock',
      async complete(req: ProviderRequest): Promise<ProviderResponse> {
        calls.push(req);
        const text = calls.length === 1
          ? '{"goal_success": {"score": 0.75, "reason": "trunc'   // truncated JSON
          : universalBody(0.75);
        return { text, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
      },
    };
    const { scores, usage } = await member({}, flaky).scoreSession(transcript, 'check balance');
    expect(calls).toHaveLength(2);
    expect(calls[1]!.maxTokens).toBeGreaterThan(calls[0]!.maxTokens);
    expect(scores['goal_success']).toBe(8); // 0.75 → 7.5 → rounds to 8
    expect(usage.totalTokens).toBe(30);     // both calls accounted for
  });

  it('falls back to a clearly-labelled neutral score after the retry also fails', async () => {
    let count = 0;
    const broken: JudgeProvider = {
      id: 'bedrock',
      async complete(): Promise<ProviderResponse> {
        count += 1;
        return { text: 'not json at all', usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
      },
    };
    const result = await member({}, broken).evaluate(transcript, 'check balance');
    expect(count).toBeGreaterThanOrEqual(2); // at least one retry happened
    const gs = result.dimensionScores['goal_success']!;
    expect(gs.score).toBe(5);
    expect(gs.justification).toMatch(/neutral/i); // auditable, not a fake judgement
  });

  it('normalizes 0–10 scale confusion from the model', async () => {
    const tenScale: JudgeProvider = {
      id: 'bedrock',
      async complete(): Promise<ProviderResponse> {
        const body: Record<string, unknown> = {};
        for (const d of SESSION_DIMENSIONS) body[d.id] = { score: 7, reason: 'r' }; // 0–10 scale
        return { text: JSON.stringify(body), usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
      },
    };
    const { scores } = await member({}, tenScale).scoreSession(transcript, 'check balance');
    expect(scores['goal_success']).toBe(8); // 7 → 0.7 → 0.75 anchor → 8/10
  });
});

// ── Live repeat-run probe (opt-in) ──────────────────────────────────────────
// Real Bedrock calls: ~4 Converse invocations on the default judge model
// (≈ $0.03–0.06 per run at Sonnet 4.5 eu pricing). Enable explicitly:
//   JUDGE_LIVE_CONSISTENCY=1 npx vitest run src/judge/__tests__/judge-consistency.test.ts
describe.runIf(process.env['JUDGE_LIVE_CONSISTENCY'] === '1')('live Bedrock repeat-run stability', () => {
  it('scores the same transcript within ±1 point per dimension across two runs', { timeout: 300_000 }, async () => {
    const spec: JudgeSpec = {
      id: 'live',
      provider: 'bedrock',
      modelId: DEFAULT_JUDGE_MODEL_ID,
      region: process.env['BEDROCK_REGION'] || 'eu-west-2',
    };
    const live = new JudgeMember(spec, new BedrockJudgeProvider(), {
      systemPrompt: DEFAULT_JUDGE_SYSTEM_PROMPT,
      temperature: 0,
      maxTokens: 2400,
    });
    const a = await live.evaluate(transcript, 'check the account balance');
    const b = await live.evaluate(transcript, 'check the account balance');
    for (const [dim, ds] of Object.entries(a.dimensionScores)) {
      const other = b.dimensionScores[dim];
      expect(other, `dimension ${dim} missing on second run`).toBeTruthy();
      expect(Math.abs(ds.score - other!.score), `dimension ${dim} drifted`).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(a.overallScore - b.overallScore)).toBeLessThanOrEqual(0.5);
  });
});
