// Similarity search over crawled platform-doc chunks.
//
// Default (all DBs): cosine similarity is computed in TypeScript over the JSON
// vectors stored in `embeddingRaw` — works on Postgres and SQLite alike and needs
// no extension. The pgvector `<=>` path (via $queryRaw) is an opt-in optimisation
// gated on GUARDRAIL_USE_PGVECTOR=true; it requires an `embedding vector(1024)`
// column + the `vector` extension added by a future migration.
import { prisma } from '../db/client.js';
import { embedText } from './embedder.js';

export interface DocChunk {
  id: string;
  platform: string;
  docUrl: string;
  chunkIndex: number;
  content: string;
  /** Cosine similarity to the query in [-1, 1] (higher is closer). */
  similarity: number;
}

function usePgVector(): boolean {
  return process.env['GUARDRAIL_USE_PGVECTOR'] === 'true';
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Retrieve the `topK` most similar doc chunks for `platform` against `query`. */
export async function retrieveChunks(
  query: string,
  platform: string,
  topK = 5,
): Promise<DocChunk[]> {
  const queryVector = await embedText(query);
  return usePgVector()
    ? retrieveViaPgVector(queryVector, platform, topK)
    : retrieveViaTsCosine(queryVector, platform, topK);
}

// Dev path: load the platform's chunks and rank in-process.
async function retrieveViaTsCosine(
  queryVector: number[],
  platform: string,
  topK: number,
): Promise<DocChunk[]> {
  const rows = await prisma.platformDocChunk.findMany({ where: { platform } });
  const scored = rows.map((r) => {
    let embedding: number[] = [];
    try {
      const parsed = JSON.parse(r.embeddingRaw) as unknown;
      if (Array.isArray(parsed)) embedding = parsed as number[];
    } catch {
      embedding = [];
    }
    return {
      id: r.id,
      platform: r.platform,
      docUrl: r.docUrl,
      chunkIndex: r.chunkIndex,
      content: r.content,
      similarity: cosineSimilarity(queryVector, embedding),
    };
  });
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

// Prod path: delegate ranking to pgvector. Requires a prod migration that adds an
// `embedding vector(1024)` column + index and `CREATE EXTENSION vector`.
async function retrieveViaPgVector(
  queryVector: number[],
  platform: string,
  topK: number,
): Promise<DocChunk[]> {
  const literal = `[${queryVector.join(',')}]`;
  const rows = await prisma.$queryRaw<
    { id: string; platform: string; docUrl: string; chunkIndex: number; content: string; similarity: number }[]
  >`
    SELECT id,
           platform,
           "docUrl",
           "chunkIndex",
           content,
           1 - (embedding <=> ${literal}::vector) AS similarity
    FROM "PlatformDocChunk"
    WHERE platform = ${platform}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${topK}
  `;
  return rows.map((r) => ({
    id: r.id,
    platform: r.platform,
    docUrl: r.docUrl,
    chunkIndex: r.chunkIndex,
    content: r.content,
    similarity: Number(r.similarity),
  }));
}
