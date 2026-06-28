import { describe, expect, it } from 'vitest';

import { crawlAndChunk, hashContent, htmlToText } from './crawler.js';

describe('htmlToText', () => {
  it('strips scripts/styles/tags and collapses whitespace', () => {
    const html =
      '<html><head><style>.x{color:red}</style><script>evil()</script></head>' +
      '<body><h1>Hello</h1>\n\n  <p>World &amp; friends</p></body></html>';
    const text = htmlToText(html);
    expect(text).not.toContain('<');
    expect(text).not.toContain('evil()');
    expect(text).not.toContain('color:red');
    expect(text).toContain('Hello World & friends');
  });
});

describe('hashContent', () => {
  it('is deterministic and content-sensitive', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });
});

describe('crawlAndChunk', () => {
  it('fetches, converts to text, hashes, and chunks', async () => {
    const body = `<p>${Array.from({ length: 1200 }, (_, i) => `word${i}`).join(' ')}</p>`;
    const fakeFetch = (async () => new Response(body, { status: 200 })) as unknown as typeof fetch;

    const result = await crawlAndChunk('https://docs.example/page', fakeFetch);

    expect(result.content).toContain('word0');
    expect(result.content).not.toContain('<p>');
    expect(result.contentHash).toBe(hashContent(result.content));
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.join(' ')).toContain('word1199');
  });

  it('throws on a non-OK response', async () => {
    const fakeFetch = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(crawlAndChunk('https://x', fakeFetch)).rejects.toThrow();
  });
});
