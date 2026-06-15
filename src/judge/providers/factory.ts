// src/judge/providers/factory.ts
import { type JudgeProviderId } from '../../shared/judge-committee.js';
import { AnthropicJudgeProvider } from './anthropic.js';
import { AzureOpenAIJudgeProvider } from './azure-openai.js';
import { BedrockJudgeProvider } from './bedrock.js';
import { GeminiJudgeProvider } from './gemini.js';
import { OpenAIJudgeProvider } from './openai.js';
import type { JudgeProvider } from './types.js';

// Credential-availability detection lives in the SDK-free shared module so the
// settings layer can use it without loading provider SDKs. Re-exported here for
// callers that already depend on the factory.
export { availableProviders, providerAvailable } from '../../shared/judge-committee.js';

const singletons = new Map<JudgeProviderId, JudgeProvider>();

export function createJudgeProvider(provider: JudgeProviderId): JudgeProvider {
  const existing = singletons.get(provider);
  if (existing) return existing;

  let instance: JudgeProvider;
  switch (provider) {
    case 'bedrock':
      instance = new BedrockJudgeProvider();
      break;
    case 'openai':
      instance = new OpenAIJudgeProvider();
      break;
    case 'azure-openai':
      instance = new AzureOpenAIJudgeProvider();
      break;
    case 'anthropic':
      instance = new AnthropicJudgeProvider();
      break;
    case 'gemini':
      instance = new GeminiJudgeProvider();
      break;
    default:
      throw new Error(`Unknown judge provider: ${provider as string}`);
  }
  singletons.set(provider, instance);
  return instance;
}
