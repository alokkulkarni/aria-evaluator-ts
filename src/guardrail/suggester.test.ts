import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GuardrailRecommendation } from './types.js';

const mocks = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../judge/providers/bedrock.js', () => ({
  BedrockJudgeProvider: class {
    complete = mocks.complete;
  },
}));

import { suggestGuardrails } from './suggester.js';

const CURATED: GuardrailRecommendation[] = [
  {
    id: 'pii-portfolio',
    guardrailType: 'PII_FILTER',
    severity: 'RECOMMENDED',
    title: 'Protect portfolio and holdings data',
    description: 'Mask holdings.',
    rationale: 'Sensitive.',
    regulations: ['GDPR Art. 5'],
    source: 'curated',
  },
];

const VALID = JSON.stringify([
  {
    type: 'CONTENT_POLICY',
    title: 'Cross-border data-transfer safeguards',
    description: 'Apply transfer safeguards for cross-border client data.',
    rationale: 'Cross-border transfers need a lawful mechanism.',
    regulations: ['GDPR Chapter V'],
    severity: 'RECOMMENDED',
  },
  {
    // A semantic duplicate of an existing curated guardrail — must be dropped.
    type: 'PII_FILTER',
    title: 'Protect portfolio and holdings data',
    description: 'dup',
    rationale: 'dup',
    regulations: [],
    severity: 'RECOMMENDED',
  },
]);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env['GUARDRAIL_AI_SUGGESTIONS'];
  mocks.complete.mockResolvedValue({ text: VALID, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
});

afterEach(() => {
  delete process.env['GUARDRAIL_AI_SUGGESTIONS'];
});

describe('suggestGuardrails', () => {
  it('returns AI-suggested guardrails (source flag + ai- id prefix)', async () => {
    const out = await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED);
    expect(out.length).toBeGreaterThan(0);
    for (const r of out) {
      expect(r.source).toBe('ai-suggested');
      expect(r.id.startsWith('ai-')).toBe(true);
      expect(r.title).toBeTruthy();
      expect(r.guardrailType).toBeTruthy();
    }
  });

  it('drops suggestions that duplicate an existing curated guardrail (by title)', async () => {
    const out = await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED);
    expect(out.map((r) => r.title)).toContain('Cross-border data-transfer safeguards');
    expect(out.filter((r) => r.title === 'Protect portfolio and holdings data')).toHaveLength(0);
  });

  it('normalises non-enum severity and free-form type from the model', async () => {
    mocks.complete.mockResolvedValue({
      text: JSON.stringify([
        { type: 'conflict-of-interest', title: 'Compensation transparency', description: 'd', rationale: 'r', regulations: ['FCA COBS 2.1R'], severity: 'high' },
      ]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const out = await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('REQUIRED'); // "high" → REQUIRED
    expect(out[0]!.guardrailType).toBe('CONFLICT_OF_INTEREST'); // normalised to UPPER_SNAKE
  });

  it('returns [] when the LLM response is unparseable', async () => {
    mocks.complete.mockResolvedValue({ text: 'sorry, no', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
    expect(await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED)).toEqual([]);
  });

  it('returns [] when the model call fails (never blocks the recommend flow)', async () => {
    mocks.complete.mockRejectedValue(new Error('bedrock down'));
    expect(await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED)).toEqual([]);
  });

  it('returns [] (no model call) when GUARDRAIL_AI_SUGGESTIONS=off', async () => {
    process.env['GUARDRAIL_AI_SUGGESTIONS'] = 'off';
    const out = await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED);
    expect(out).toEqual([]);
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});

const EIGHT_UNIQUE = JSON.stringify(
  Array.from({ length: 8 }, (_, i) => ({
    type: 'CONTENT_POLICY',
    title: `Custom guardrail ${i + 1}`,
    description: 'd',
    rationale: 'r',
    regulations: [],
    severity: 'RECOMMENDED',
  })),
);

describe('suggestGuardrails — from-scratch (custom domain) mode', () => {
  it('allows up to 8 suggestions when there is no curated set', async () => {
    mocks.complete.mockResolvedValue({ text: EIGHT_UNIQUE, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
    const out = await suggestGuardrails('custom-education', 'custom-tutor', {}, []);
    expect(out).toHaveLength(8);
    for (const r of out) expect(r.source).toBe('ai-suggested');
  });

  it('uses a from-scratch system prompt (no "do NOT restate") when existing is empty', async () => {
    await suggestGuardrails('custom-education', 'custom-tutor', {}, []);
    const systemPrompt = mocks.complete.mock.calls[0]![0].systemPrompt as string;
    expect(systemPrompt).not.toMatch(/do NOT restate/i);
    expect(systemPrompt).toMatch(/comprehensive/i);
    // Asks for a deliberate severity spread so the UI's severity grouping is meaningful.
    expect(systemPrompt).toMatch(/severity spread/i);
  });

  it('threads the custom domain/function description into the prompt', async () => {
    await suggestGuardrails('custom-education', 'custom-tutor', {}, [], {
      domainDescription: 'K-12 online learning platform',
      subFunctionDescription: 'AI maths tutor for students',
    });
    const userPrompt = mocks.complete.mock.calls[0]![0].userPrompt as string;
    expect(userPrompt).toContain('K-12 online learning platform');
    expect(userPrompt).toContain('AI maths tutor for students');
  });

  it('still caps at 4 and keeps the ADDITIONAL framing when a curated set exists', async () => {
    mocks.complete.mockResolvedValue({ text: EIGHT_UNIQUE, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } });
    const out = await suggestGuardrails('banking', 'wealth-advisory', {}, CURATED);
    expect(out).toHaveLength(4);
    const systemPrompt = mocks.complete.mock.calls[0]![0].systemPrompt as string;
    expect(systemPrompt).toMatch(/do NOT restate/i);
  });
});
