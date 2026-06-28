// RAG-based platform config generator: retrieves the most relevant platform-doc
// chunks for a guardrail and asks Claude (via Bedrock) to emit a copy-paste config
// in the platform's native language. See the spec's "RAG Pipeline" section.
import { prisma } from '../db/client.js';
import { BedrockJudgeProvider } from '../judge/providers/bedrock.js';
import type {
  ConfigLanguage,
  FormattedConfig,
  GuardrailRecommendation,
  Platform,
} from '../guardrail/types.js';
import { DEFAULT_JUDGE_MODEL_ID } from '../shared/judge-config.js';
import { retrieveChunks, type DocChunk } from './retriever.js';

const PLATFORM_LANGUAGE: Record<Platform, ConfigLanguage> = {
  bedrock: 'yaml',
  langchain: 'python',
  copilot: 'text',
  foundry: 'json',
  strands: 'python',
};

// Config generation benefits from a capable model; default to the judge's model,
// overridable via env.
const FORMATTER_MODEL_ID =
  process.env['GUARDRAIL_FORMATTER_MODEL_ID']?.trim() || DEFAULT_JUDGE_MODEL_ID;

function buildSystemPrompt(platform: Platform, language: ConfigLanguage): string {
  return [
    `You generate guardrail configuration for the "${platform}" platform.`,
    `Use ONLY the documentation excerpts provided to produce a correct, copy-paste-ready ${language} config.`,
    `Output ONLY the ${language} config — no explanation, no markdown fences.`,
    'If the docs are insufficient, produce the closest valid config and add a brief inline comment noting the assumption.',
  ].join('\n');
}

function buildUserPrompt(rec: GuardrailRecommendation, chunks: DocChunk[]): string {
  const docs = chunks.length
    ? chunks.map((c, i) => `--- Source ${i + 1} (${c.docUrl}) ---\n${c.content}`).join('\n\n')
    : '(no documentation chunks retrieved; rely on well-known platform conventions)';
  return [
    'Guardrail to implement:',
    `- type: ${rec.guardrailType}`,
    `- title: ${rec.title}`,
    `- description: ${rec.description}`,
    `- rationale: ${rec.rationale}`,
    `- regulations: ${rec.regulations.join(', ') || 'n/a'}`,
    '',
    'Platform documentation excerpts:',
    docs,
  ].join('\n');
}

/** Strip a single wrapping markdown code fence if the model added one. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[a-zA-Z]*\n([\s\S]*?)\n```$/);
  return (fenced?.[1] ?? trimmed).trim();
}

async function mostRecentCrawl(platform: string): Promise<string> {
  const latest = await prisma.platformDocChunk.findFirst({
    where: { platform },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });
  return (latest?.updatedAt ?? new Date()).toISOString();
}

/** Generate a platform-specific config for a single guardrail recommendation. */
export async function formatGuardrailForPlatform(
  recommendation: GuardrailRecommendation,
  platform: Platform,
): Promise<FormattedConfig> {
  const language = PLATFORM_LANGUAGE[platform];
  const query = `${recommendation.guardrailType} ${recommendation.title}. ${recommendation.description} — ${platform} guardrail configuration`;

  const chunks = await retrieveChunks(query, platform, 5);
  const sourceDocUrls = [...new Set(chunks.map((c) => c.docUrl))];
  const docsFreshAsOf = await mostRecentCrawl(platform);

  const provider = new BedrockJudgeProvider();
  const resp = await provider.complete({
    modelId: FORMATTER_MODEL_ID,
    systemPrompt: buildSystemPrompt(platform, language),
    userPrompt: buildUserPrompt(recommendation, chunks),
    temperature: 0.1,
    maxTokens: 1500,
  });

  return {
    config: stripCodeFences(resp.text),
    language,
    sourceDocUrls,
    docsFreshAsOf,
  };
}
