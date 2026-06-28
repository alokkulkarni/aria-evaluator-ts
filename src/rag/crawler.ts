// Fetches a platform documentation page and turns it into embeddable chunks.
// Reusable, testable fetch + text-extraction + chunking logic; the doc-crawler
// Lambda is the thin orchestrator that persists/embeds the result.
import { createHash } from 'node:crypto';

import { chunkDocument } from './chunker.js';

export interface CrawledDoc {
  /** Plain text extracted from the page. */
  content: string;
  /** SHA-256 of the extracted text, for change detection. */
  contentHash: string;
  /** Overlapping chunks ready for embedding. */
  chunks: string[];
}

/** Minimal HTML → text: strip script/style/markup and collapse whitespace. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Fetch a URL and return its extracted plain text. `fetchImpl` is injectable for tests. */
export async function fetchDocText(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'aria-guardrail-doc-crawler' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return htmlToText(await res.text());
}

/** Fetch, extract text, hash, and chunk a documentation page in one step. */
export async function crawlAndChunk(url: string, fetchImpl: typeof fetch = fetch): Promise<CrawledDoc> {
  const content = await fetchDocText(url, fetchImpl);
  return { content, contentHash: hashContent(content), chunks: chunkDocument(content) };
}
