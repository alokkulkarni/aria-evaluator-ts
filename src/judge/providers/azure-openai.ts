// src/judge/providers/azure-openai.ts
import { AzureOpenAI } from 'openai';

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

const DEFAULT_API_VERSION = '2024-10-21';

const breaker = new CircuitBreaker('judge-azure-openai', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30_000,
  monitoringEnabled: false,
});

// Azure clients are deployment-scoped; cache per deployment id (req.modelId).
const clients = new Map<string, AzureOpenAI>();
function client(deployment: string): AzureOpenAI {
  const apiKey = process.env['AZURE_OPENAI_API_KEY']?.trim();
  const endpoint = process.env['AZURE_OPENAI_ENDPOINT']?.trim();
  if (!apiKey || !endpoint) {
    throw new MissingCredentialsError('azure-openai', 'AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT are required');
  }
  let c = clients.get(deployment);
  if (!c) {
    c = new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion: process.env['AZURE_OPENAI_API_VERSION']?.trim() || DEFAULT_API_VERSION,
      deployment,
    });
    clients.set(deployment, c);
  }
  return c;
}

export class AzureOpenAIJudgeProvider implements JudgeProvider {
  readonly id = 'azure-openai' as const;

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    // For Azure, req.modelId is the deployment name.
    const azure = client(req.modelId);
    try {
      const resp = await breaker.execute(() =>
        withTimeout(
          azure.chat.completions.create({
            model: req.modelId,
            temperature: req.temperature,
            max_tokens: req.maxTokens,
            messages: [
              { role: 'system', content: req.systemPrompt },
              { role: 'user', content: req.userPrompt },
            ],
          }),
          JUDGE_CALL_TIMEOUT_MS,
          'azure-openai',
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
      throw new JudgeProviderError('azure-openai', err instanceof Error ? err.message : String(err));
    }
  }
}
