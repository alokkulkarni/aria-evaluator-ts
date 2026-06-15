// src/judge/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';

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

const breaker = new CircuitBreaker('judge-anthropic', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30_000,
  monitoringEnabled: false,
});

let cached: Anthropic | null = null;
function client(): Anthropic {
  const apiKey = process.env['ANTHROPIC_API_KEY']?.trim();
  if (!apiKey) throw new MissingCredentialsError('anthropic', 'ANTHROPIC_API_KEY is not set');
  if (!cached) cached = new Anthropic({ apiKey });
  return cached;
}

export class AnthropicJudgeProvider implements JudgeProvider {
  readonly id = 'anthropic' as const;

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const anthropic = client();
    try {
      const resp = await breaker.execute(() =>
        withTimeout(
          anthropic.messages.create({
            model: req.modelId,
            system: req.systemPrompt,
            max_tokens: req.maxTokens,
            temperature: req.temperature,
            messages: [{ role: 'user', content: req.userPrompt }],
          }),
          JUDGE_CALL_TIMEOUT_MS,
          'anthropic',
        ),
      );
      const text = resp.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
      const inputTokens = resp.usage?.input_tokens ?? 0;
      const outputTokens = resp.usage?.output_tokens ?? 0;
      return {
        text,
        usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      };
    } catch (err) {
      if (err instanceof MissingCredentialsError) throw err;
      throw new JudgeProviderError('anthropic', err instanceof Error ? err.message : String(err));
    }
  }
}
