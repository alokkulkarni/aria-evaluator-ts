import { describe, expect, it } from 'vitest';

import { chunkDocument, estimateTokens } from './chunker.js';

/** Whitespace-split words, used to measure overlap between chunks in tests. */
function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** Largest k such that the last k words of `prev` equal the first k of `next`. */
function trailingOverlapWords(prev: string, next: string): number {
  const p = words(prev);
  const n = words(next);
  const max = Math.min(p.length, n.length);
  let overlap = 0;
  for (let k = 1; k <= max; k++) {
    if (p.slice(p.length - k).join(' ') === n.slice(0, k).join(' ')) overlap = k;
  }
  return overlap;
}

describe('chunkDocument', () => {
  it('chunks a 2000-word document into segments of ≤512 tokens', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `word${i}`).join(' ');

    const chunks = chunkDocument(text, { maxTokens: 512, overlapTokens: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(estimateTokens(chunk)).toBeLessThanOrEqual(512);
    }
    // No content is dropped — first and last words appear across the chunks.
    expect(chunks.join(' ')).toContain('word0');
    expect(chunks.join(' ')).toContain('word1999');
  });

  it('never splits a fenced code block across chunks', () => {
    const codeBlock = [
      '```python',
      ...Array.from({ length: 60 }, (_, i) => `line_${i} = compute(${i})`),
      '```',
    ].join('\n');
    const before = Array.from({ length: 600 }, (_, i) => `pre${i}`).join(' ');
    const after = Array.from({ length: 600 }, (_, i) => `post${i}`).join(' ');
    const text = `${before}\n\n${codeBlock}\n\n${after}`;

    const chunks = chunkDocument(text, { maxTokens: 512, overlapTokens: 50 });

    // The complete code block (both fences + body) lives intact in exactly one chunk.
    expect(chunks.filter((c) => c.includes(codeBlock))).toHaveLength(1);
    // The opening fence never appears in more than one chunk (no partial duplication).
    expect(chunks.filter((c) => c.includes('```python'))).toHaveLength(1);
  });

  it('overlaps consecutive chunks by approximately 50 tokens', () => {
    const text = Array.from({ length: 2000 }, (_, i) => `tok${i}`).join(' ');

    const chunks = chunkDocument(text, { maxTokens: 512, overlapTokens: 50 });

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length - 1; i++) {
      const overlapWordCount = trailingOverlapWords(chunks[i]!, chunks[i + 1]!);
      const overlapTokens = estimateTokens(Array.from({ length: overlapWordCount }, () => 'x').join(' '));
      // ~50 tokens, with a band that absorbs the word→token heuristic rounding.
      expect(overlapTokens).toBeGreaterThanOrEqual(25);
      expect(overlapTokens).toBeLessThanOrEqual(75);
    }
  });
});
