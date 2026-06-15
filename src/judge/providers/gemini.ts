// src/judge/providers/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';

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

const breaker = new CircuitBreaker('judge-gemini', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30_000,
  monitoringEnabled: false,
});

let cached: GoogleGenerativeAI | null = null;
function client(): GoogleGenerativeAI {
  const apiKey = process.env['GEMINI_API_KEY']?.trim() || process.env['GOOGLE_API_KEY']?.trim();
  if (!apiKey) throw new MissingCredentialsError('gemini', 'GEMINI_API_KEY is not set');
  if (!cached) cached = new GoogleGenerativeAI(apiKey);
  return cached;
}

export class GeminiJudgeProvider implements JudgeProvider {
  readonly id = 'gemini' as const;

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const model = client().getGenerativeModel({
      model: req.modelId,
      systemInstruction: req.systemPrompt,
    });
    try {
      const result = await breaker.execute(() =>
        withTimeout(
          model.generateContent({
            contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
            generationConfig: { temperature: req.temperature, maxOutputTokens: req.maxTokens },
          }),
          JUDGE_CALL_TIMEOUT_MS,
          'gemini',
        ),
      );
      const usage = result.response.usageMetadata;
      return {
        text: result.response.text(),
        usage: {
          inputTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof MissingCredentialsError) throw err;
      throw new JudgeProviderError('gemini', err instanceof Error ? err.message : String(err));
    }
  }
}
