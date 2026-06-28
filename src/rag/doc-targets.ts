// Live platform documentation URLs crawled by the doc crawler (Lambda) and used
// as the RAG corpus for platform-specific config generation. See the spec's
// "RAG Pipeline for Platform Formatting" section.
import type { Platform } from '../guardrail/types.js';

export const DOC_TARGETS: Record<Platform, string[]> = {
  bedrock: [
    'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html',
    'https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-create.html',
    'https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateGuardrail.html',
  ],
  langchain: [
    'https://python.langchain.com/docs/how_to/output_parser_json/',
    'https://python.langchain.com/docs/concepts/structured_outputs/',
  ],
  copilot: [
    'https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-ai-features',
  ],
  foundry: [
    'https://learn.microsoft.com/en-us/azure/ai-foundry/concepts/content-filtering',
  ],
  strands: [
    'https://strandsagents.com/latest/documentation/docs/safety-privacy/',
  ],
};
