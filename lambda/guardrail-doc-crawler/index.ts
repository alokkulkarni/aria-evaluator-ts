// Guardrail Advisor — platform documentation crawler (AWS Lambda, EventBridge
// scheduled trigger). For each platform URL in DOC_TARGETS it crawls + chunks the
// page (src/rag/crawler), embeds the chunks, and upserts PlatformDocChunk rows —
// skipping pages whose content is unchanged (contentHash). When a page changes,
// configs whose citations reference it are marked stale (configGeneratedAt = null).
//
// IMPORTANT: never log doc content (PII / ToS). Only counts, URLs, and errors.
//
// Build: this handler imports from src/ (crawler, embedder, doc-targets, prisma),
// so it is bundled with its dependencies (e.g. esbuild + the Prisma engine) into a
// deployment package referenced by infra/terraform/guardrail-rag.tf.
import { prisma } from '../../src/db/client.js';
import { DOC_TARGETS } from '../../src/rag/doc-targets.js';
import { crawlAndChunk } from '../../src/rag/crawler.js';
import { embedText } from '../../src/rag/embedder.js';

interface CrawlSummary {
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
