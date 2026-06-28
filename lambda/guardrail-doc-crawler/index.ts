// Guardrail Advisor — platform documentation crawler (AWS Lambda, EventBridge
// scheduled trigger). For each platform URL in DOC_TARGETS it fetches the page,
// chunks + embeds the text, and upserts PlatformDocChunk rows — skipping pages
// whose content is unchanged (contentHash). When a page changes, configs whose
// citations reference it are marked stale (configGeneratedAt = null).
//
// IMPORTANT: never log doc content (PII / ToS). Only counts, URLs, and errors.
//
// Build: this handler imports from src/ (chunker, embedder, doc-targets, prisma),
// so it is bundled with its dependencies (e.g. esbuild + the Prisma engine) into a
// deployment package referenced by infra/terraform/guardrail-rag.tf.
import { createHash } from 'node:crypto';

import { prisma } from '../../src/db/client.js';
import { DOC_TARGETS } from '../../src/rag/doc-targets.js';
import { chunkDocument } from '../../src/rag/chunker.js';
import { embedText } from '../../src/rag/embedder.js';

interface CrawlSummary {
  platform: string;
  checked: number;
  updated: number;
  skipped: number;
  failed: number;
}

// Minimal HTML → text: strip script/style/markup and collapse whitespace.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function fetchDoc(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'user-agent': 'aria-guardrail-doc-crawler' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return htmlToText(await res.text());
}

// Mark generated configs that cited a changed doc as stale so they get regenerated.
async function markConfigsStale(platform: string, docUrl: string): Promise<void> {
  const sessions = await prisma.guardrailAdvisorSession.findMany({
    where: { platform },
    select: { id: true },
  });
  if (sessions.length === 0) return;
  await prisma.guardrailRecommendationRecord.updateMany({
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
      sourceDocUrls: { contains: docUrl },
    },
    data: { configGeneratedAt: null },
  });
}

async function crawlUrl(platform: string, url: string, summary: CrawlSummary): Promise<void> {
  summary.checked += 1;
  const text = await fetchDoc(url);
  const contentHash = hashContent(text);

  const existing = await prisma.platformDocChunk.findFirst({
    where: { docUrl: url },
    select: { contentHash: true },
  });
  if (existing && existing.contentHash === contentHash) {
    summary.skipped += 1;
    return;
  }

  const chunks = chunkDocument(text);
  // Replace this URL's chunks wholesale so a changed chunk count can't leave
  // stale rows (the [docUrl, chunkIndex] unique constraint also requires this).
  await prisma.platformDocChunk.deleteMany({ where: { docUrl: url } });
  for (let i = 0; i < chunks.length; i += 1) {
    const content = chunks[i] ?? '';
    const embedding = await embedText(content);
    await prisma.platformDocChunk.create({
      data: {
        platform,
        docUrl: url,
        chunkIndex: i,
        content,
        contentHash,
        embeddingRaw: JSON.stringify(embedding),
      },
    });
  }

  // Only an actual change (not a first crawl) invalidates existing configs.
  if (existing) await markConfigsStale(platform, url);
  summary.updated += 1;
}

/** EventBridge scheduled handler. Crawls all platform docs and returns a summary. */
export async function handler(): Promise<{ summaries: CrawlSummary[] }> {
  const summaries: CrawlSummary[] = [];

  for (const [platform, urls] of Object.entries(DOC_TARGETS)) {
    const summary: CrawlSummary = { platform, checked: 0, updated: 0, skipped: 0, failed: 0 };
    for (const url of urls) {
      try {
        await crawlUrl(platform, url, summary);
      } catch (err) {
        summary.failed += 1;
        // Log the URL + error only — never the doc content.
        console.error(`[guardrail-crawl] ${platform} ${url} failed: ${(err as Error).message}`);
      }
    }
    console.log(
      `[guardrail-crawl] ${summary.platform}: checked=${summary.checked} updated=${summary.updated} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    summaries.push(summary);
  }

  return { summaries };
}
