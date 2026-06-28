// AWS Bedrock Titan Text Embeddings v2 wrapper for the Guardrail Advisor RAG
// pipeline. Reuses the region-scoped client pattern from src/judge/providers.
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

/** Titan Text Embeddings v2. */
export const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';

// Titan v2's native output is 1024 floats (configurable to 256/512/1024 — it does
// NOT emit 1536). The prod pgvector column must be declared `vector(1024)` to match.
export const EMBEDDING_DIMENSIONS = 1024;

// One client per region — Bedrock clients are region-scoped (mirrors src/judge).
const clients = new Map<string, BedrockRuntimeClient>();
function clientForRegion(region: string): BedrockRuntimeClient {
  let c = clients.get(region);
  if (!c) {
    c = new BedrockRuntimeClient({ region });
    clients.set(region, c);
  }
  return c;
}

function resolveRegion(): string {
  return (process.env['BEDROCK_REGION'] || process.env['AWS_REGION'] || 'eu-west-2').trim();
}

/** Embed a single string into a dense vector via Titan Text Embeddings v2. */
export async function embedText(text: string): Promise<number[]> {
  const resp = await clientForRegion(resolveRegion()).send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({ inputText: text, dimensions: EMBEDDING_DIMENSIONS, normalize: true }),
    }),
  );
  const payload = JSON.parse(new TextDecoder().decode(resp.body)) as { embedding?: number[] };
  if (!Array.isArray(payload.embedding)) {
    throw new Error('Titan embeddings response missing "embedding" array');
  }
  return payload.embedding;
}

/**
 * Deterministic fake embedding for tests — identical text always yields the same
 * L2-normalised vector, and different text yields a different one. No network call.
 */
export async function embedTextMock(text: string): Promise<number[]> {
  // Seed a xorshift32 PRNG from a simple string hash for reproducible vectors.
  let state = 0;
  for (let i = 0; i < text.length; i++) {
    state = (state * 31 + text.charCodeAt(i)) >>> 0;
  }
  state = state || 1;

  const vec = new Array<number>(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    vec[i] = (state / 0xffffffff) * 2 - 1; // [-1, 1)
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}
