import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fns created via vi.hoisted so they exist when the (hoisted) vi.mock
// factories below reference them.
const mocks = vi.hoisted(() => ({
  openaiCreate: vi.fn(),
  anthropicCreate: vi.fn(),
  geminiGenerate: vi.fn(),
}));

vi.mock('openai', () => {
  class OpenAI {
    chat = { completions: { create: mocks.openaiCreate } };
    constructor(_opts: unknown) {}
  }
  class AzureOpenAI {
    chat = { completions: { create: mocks.openaiCreate } };
    constructor(_opts: unknown) {}
  }
  return { default: OpenAI, AzureOpenAI };
});

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = { create: mocks.anthropicCreate };
    constructor(_opts: unknown) {}
  }
  return { default: Anthropic };
});

vi.mock('@google/generative-ai', () => {
  class GoogleGenerativeAI {
    constructor(_key: string) {}
    getGenerativeModel() {
      return { generateContent: mocks.geminiGenerate };
    }
  }
  return { GoogleGenerativeAI };
});

import { OpenAIJudgeProvider } from '../providers/openai.js';
import { AnthropicJudgeProvider } from '../providers/anthropic.js';
import { GeminiJudgeProvider } from '../providers/gemini.js';
import { MissingCredentialsError, type ProviderRequest } from '../providers/types.js';

const req: ProviderRequest = {
  modelId: 'm',
  systemPrompt: 'sys',
  userPrompt: 'user',
  temperature: 0,
  maxTokens: 500,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.openaiCreate.mockResolvedValue({
    choices: [{ message: { content: '{"correctness":{"score":0.8}}' } }],
    usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
  });
  mocks.anthropicCreate.mockResolvedValue({
    content: [{ type: 'text', text: '{"correctness":{"score":0.7}}' }],
    usage: { input_tokens: 20, output_tokens: 8 },
  });
  mocks.geminiGenerate.mockResolvedValue({
    response: {
      text: () => '{"correctness":{"score":0.6}}',
      usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 10, totalTokenCount: 40 },
    },
  });
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.GEMINI_API_KEY;
});

describe('OpenAIJudgeProvider', () => {
  it('throws MissingCredentialsError without an API key', async () => {
    await expect(new OpenAIJudgeProvider().complete(req)).rejects.toBeInstanceOf(MissingCredentialsError);
  });

  it('maps the chat completion + usage and sends system/user messages', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const resp = await new OpenAIJudgeProvider().complete(req);
    expect(resp.text).toContain('correctness');
    expect(resp.usage).toEqual({ inputTokens: 12, outputTokens: 6, totalTokens: 18 });
    const call = mocks.openaiCreate.mock.calls[0]![0] as { model: string; messages: Array<{ role: string }> };
    expect(call.model).toBe('m');
    expect(call.messages.map((m) => m.role)).toEqual(['system', 'user']);
  });
});

describe('AnthropicJudgeProvider', () => {
  it('extracts text blocks and normalises usage', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const resp = await new AnthropicJudgeProvider().complete(req);
    expect(resp.text).toContain('correctness');
    expect(resp.usage).toEqual({ inputTokens: 20, outputTokens: 8, totalTokens: 28 });
  });
});

describe('GeminiJudgeProvider', () => {
  it('reads response text + usageMetadata', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const resp = await new GeminiJudgeProvider().complete(req);
    expect(resp.text).toContain('correctness');
    expect(resp.usage).toEqual({ inputTokens: 30, outputTokens: 10, totalTokens: 40 });
  });
});
