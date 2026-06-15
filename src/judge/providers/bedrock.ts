// src/judge/providers/bedrock.ts
import { BedrockRuntimeClient, ConverseCommand, type Message } from '@aws-sdk/client-bedrock-runtime';

import { CircuitBreaker } from '../../lib/circuit-breaker.js';
import { extractBareModelId, formatModelIdForRegion } from '../../shared/judge-config.js';
import {
  JUDGE_CALL_TIMEOUT_MS,
  JudgeProviderError,
  withTimeout,
  type JudgeProvider,
  type ProviderRequest,
  type ProviderResponse,
} from './types.js';

const breaker = new CircuitBreaker('judge-bedrock', {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30_000,
  monitoringEnabled: false,
});

// One client per region — Bedrock clients are region-scoped.
const clients = new Map<string, BedrockRuntimeClient>();
function clientForRegion(region: string): BedrockRuntimeClient {
  let c = clients.get(region);
  if (!c) {
    c = new BedrockRuntimeClient({ region });
    clients.set(region, c);
  }
  return c;
}

export class BedrockJudgeProvider implements JudgeProvider {
  readonly id = 'bedrock' as const;

  async complete(req: ProviderRequest): Promise<ProviderResponse> {
    const region = (req.region || process.env['BEDROCK_REGION'] || process.env['AWS_REGION'] || 'eu-west-2').trim();
    const modelId = formatModelIdForRegion(extractBareModelId(req.modelId), region);
    const messages: Message[] = [{ role: 'user', content: [{ text: req.userPrompt }] }];

    try {
      const resp = await breaker.execute(() =>
        withTimeout(
          clientForRegion(region).send(
            new ConverseCommand({
              modelId,
              messages,
              system: [{ text: req.systemPrompt }],
              inferenceConfig: { maxTokens: req.maxTokens, temperature: req.temperature },
            }),
          ),
          JUDGE_CALL_TIMEOUT_MS,
          'bedrock',
        ),
      );
      const text = (resp.output?.message?.content?.[0] as { text?: string } | undefined)?.text ?? '';
      return {
        text,
        usage: {
          inputTokens: resp.usage?.inputTokens ?? 0,
          outputTokens: resp.usage?.outputTokens ?? 0,
          totalTokens: resp.usage?.totalTokens ?? 0,
        },
      };
    } catch (err) {
      throw new JudgeProviderError('bedrock', err instanceof Error ? err.message : String(err));
    }
  }
}
