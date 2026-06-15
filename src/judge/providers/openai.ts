// src/judge/providers/openai.ts
import OpenAI from 'openai';

import { CircuitBreaker } from '../../lib/circuit-breaker.js';
import {
  JUDGE_CALL_TIMEOUT_MS,
  JudgeProviderError,
  MissingCredentialsError,
  withTimeout,
  type JudgeProvider,
  type ProviderRequest,
  type ProviderResponse,
} from './types.js';

const breaker = new CircuitBreaker('judge-openai', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30_000,
  monitoringEnabled: false,
});

let cached: OpenAI | null = null;
function client(): OpenAI {
  const apiKey = process.env['OPENAI_API_KEY']?.trim();
  if (!apiKey) throw new MissingCredentialsError('openai', 'OPENAI_API_KEY is not set');
  if (!cached) {
    cached = new OpenAI({ apiKey, baseURL: process.env['OPENAI_BASE_URL']?.trim() || undefined });
  }
  return cached;
}

export class OpenAIJudgeProvider implements JudgeProvider {
  readonly id = 'openai' as const;

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const openai = client();
    try {
      const resp = await breaker.execute(() =>
        withTimeout(
          openai.chat.completions.create({
            model: req.modelId,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            messages: [
              { role: 'system', content: req.systemPrompt },
              { role: 'user', content: req.userPrompt },
            ],
          }),
          JUDGE_CALL_TIMEOUT_MS,
          'openai',
        ),
      );
      return {
        text: resp.choices[0]?.message?.content ?? '',
        usage: {
          inputTokens: resp.usage?.prompt_tokens ?? 0,
          outputTokens: resp.usage?.completion_tokens ?? 0,
          totalTokens: resp.usage?.total_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof MissingCredentialsError) throw err;
      throw new JudgeProviderError('openai', err instanceof Error ? err.message : String(err));
    }
  }
}
