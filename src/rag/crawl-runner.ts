// Shared crawl orchestration for the Guardrail Advisor RAG corpus. Used by both
// the doc-crawler Lambda (dev/prod) and the `cli:guardrail-crawl` command (local).
//
// For each DOC_TARGETS URL: crawl + chunk (src/rag/crawler), embed each chunk
// (Titan v2), and upsert PlatformDocChunk — skipping pages whose content is
// unchanged (contentHash). When a page changes, configs that cited it are marked
// stale (configGeneratedAt = null). NEVER logs doc content — only counts/URLs/errors.
import { prisma } from '../db/client.js';
import { crawlAndChunk } from './crawler.js';
import { DOC_TARGETS } from './doc-targets.js';
import { embedText } from './embedder.js';

export interface CrawlSummary {
  platform: string;
  checked: number;
  updated: number;
  skipped: number;
  failed: number;
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
  const { contentHash, chunks } = await crawlAndChunk(url);

  const existing = await prisma.platformDocChunk.findFirst({
    where: { docUrl: url },
    select: { contentHash: true },
  });
  if (existing && existing.contentHash === contentHash) {
    summary.skipped += 1;
    return;
  }

  // Replace this URL's chunks wholesale so a changed chunk count can't leave
  // stale rows (the [docUrl, chunkIndex] unique constraint also requires this).
  await prisma.platformDocChunk.deleteMany({ where: { docUrl: url } });
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkText = chunks[i] ?? '';
    const embedding = await embedText(chunkText);
    await prisma.platformDocChunk.create({
      data: {
        platform,
        docUrl: url,
        chunkIndex: i,
        content: chunkText,
        contentHash,
        embeddingRaw: JSON.stringify(embedding),
      },
    });
  }

  // Only an actual change (not a first crawl) invalidates existing configs.
  if (existing) await markConfigsStale(platform, url);
  summary.updated += 1;
}

/** Crawl every platform's DOC_TARGETS, refreshing the corpus. Returns a summary. */
export async function runCrawl(): Promise<CrawlSummary[]> {
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

  return summaries;
}
