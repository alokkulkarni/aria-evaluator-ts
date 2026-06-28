import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CLARIFYING_QUESTION_TYPES } from './types.js';

// Mock the Bedrock judge provider so no real model call happens.
const mocks = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('../judge/providers/bedrock.js', () => ({
  BedrockJudgeProvider: class {
    complete = mocks.complete;
  },
}));

import { FALLBACK_QUESTIONS, generateQuestions } from './clarifier.js';

const VALID_LLM_JSON = JSON.stringify([
  {
    id: 'jurisdiction',
    text: 'Which regulatory regions apply?',
    type: 'multi-choice',
    options: [
      { value: 'EU', label: 'EU / GDPR' },
      { value: 'US', label: 'US / FINRA' },
    ],
  },
  {
    id: 'user-facing',
    text: 'Is this agent user-facing or internal?',
    type: 'single-choice',
    options: [
      { value: 'customers', label: 'Customer-facing' },
      { value: 'staff', label: 'Internal / staff' },
    ],
  },
  {
    id: 'pii-types',
    text: 'Which PII does it handle?',
    type: 'multi-choice',
    options: [
      { value: 'ssn', label: 'SSN' },
      { value: 'account', label: 'Account numbers' },
    ],
  },
  { id: 'notes', text: 'Anything else we should know?', type: 'text' },
]);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.complete.mockResolvedValue({
    text: VALID_LLM_JSON,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  });
});

describe('generateQuestions', () => {
  it('returns between 3 and 5 questions', async () => {
    const qs = await generateQuestions('banking', 'customer-support');
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
  });

  it('only returns questions with a valid type', async () => {
    const qs = await generateQuestions('legal', 'contract-review');
    for (const q of qs) {
      expect(CLARIFYING_QUESTION_TYPES).toContain(q.type);
    }
  });

  it('gives single/multi-choice questions at least 2 options', async () => {
    const qs = await generateQuestions('healthcare', 'patient-support');
    for (const q of qs) {
      if (q.type !== 'text') {
        expect((q.options ?? []).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('falls back to a valid built-in set when the LLM response is unparseable', async () => {
    mocks.complete.mockResolvedValue({
      text: 'sorry, I cannot help with that',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const qs = await generateQuestions('hr', 'onboarding');
    expect(qs).toEqual(FALLBACK_QUESTIONS);
    expect(qs.length).toBeGreaterThanOrEqual(3);
    expect(qs.length).toBeLessThanOrEqual(5);
  });

  it('falls back when the model call throws', async () => {
    mocks.complete.mockRejectedValue(new Error('bedrock unavailable'));
    const qs = await generateQuestions('insurance', 'claims');
    expect(qs).toEqual(FALLBACK_QUESTIONS);
  });
});
