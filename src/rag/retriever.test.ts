import { beforeEach, describe, expect, it, vi } from 'vitest';

// Hoisted so the vi.mock factories below can close over them.
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  embedText: vi.fn(),
}));

vi.mock('../db/client.js', () => ({
  prisma: { platformDocChunk: { findMany: mocks.findMany } },
}));

// Mock the embedder so no real Bedrock call happens and the query vector is fixed
// (satisfies the "use a mock embedder in tests" requirement deterministically).
vi.mock('./embedder.js', () => ({
  embedText: mocks.embedText,
}));

import { retrieveChunks } from './retriever.js';

function row(id: string, platform: string, embedding: number[]) {
  return {
    id,
    platform,
    docUrl: `https://docs.example/${id}`,
    chunkIndex: 0,
    content: `content ${id}`,
    contentHash: `hash-${id}`,
    embeddingRaw: JSON.stringify(embedding),
    crawledAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Force the dev (SQLite/TS-cosine) retrieval path, not the prod pgvector path.
  process.env['DATABASE_URL'] = 'file:./dev.db';
  // Query vector points along the first axis.
  mocks.embedText.mockResolvedValue([1, 0, 0]);
});

describe('retrieveChunks', () => {
  it('returns top-5 chunks ordered by descending cosine similarity', async () => {
    mocks.findMany.mockResolvedValue([
      row('a', 'bedrock', [1, 0, 0]), // sim 1.0
      row('b', 'bedrock', [0.9, 0.1, 0]), // ~0.99
      row('c', 'bedrock', [0.5, 0.5, 0]), // ~0.71
      row('d', 'bedrock', [0.2, 0.8, 0]), // ~0.24
      row('e', 'bedrock', [0, 1, 0]), // 0
      row('f', 'bedrock', [0, 0.9, 0.1]), // ~0
      row('g', 'bedrock', [-1, 0, 0]), // -1
    ]);

    const result = await retrieveChunks('how to configure', 'bedrock', 5);

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    for (let i = 0; i < result.length - 1; i++) {
      expect(result[i]!.similarity).toBeGreaterThanOrEqual(result[i + 1]!.similarity);
    }
    expect(mocks.findMany).toHaveBeenCalledWith({ where: { platform: 'bedrock' } });
  });

  it('returns an empty array when no chunks exist for the platform', async () => {
    mocks.findMany.mockResolvedValue([]);

    const result = await retrieveChunks('anything', 'langchain', 5);

    expect(result).toEqual([]);
  });

  it('filters strictly by platform — other platforms are not returned', async () => {
    mocks.findMany.mockImplementation(
      async ({ where }: { where: { platform: string } }) =>
        [row('a', 'bedrock', [1, 0, 0]), row('z', 'foundry', [1, 0, 0])].filter(
          (r) => r.platform === where.platform,
        ),
    );

    const result = await retrieveChunks('q', 'bedrock', 5);

    expect(result.map((r) => r.id)).toEqual(['a']);
    expect(result.every((r) => r.platform === 'bedrock')).toBe(true);
  });
});
