// Guardrail Advisor — platform documentation crawler (AWS Lambda, EventBridge
// scheduled trigger). Thin wrapper over the shared runCrawl() orchestration in
// src/rag/crawl-runner — the same logic the local `cli:guardrail-crawl` command runs.
//
// Build: this handler imports from src/, so it is bundled with its dependencies
// (esbuild + the Prisma engine) into a deployment package referenced by the
// modules/guardrail-rag Terraform module.
import { runCrawl, type CrawlSummary } from '../../src/rag/crawl-runner.js';

/** EventBridge scheduled handler. Crawls all platform docs and returns a summary. */
export async function handler(): Promise<{ summaries: CrawlSummary[] }> {
  return { summaries: await runCrawl() };
}
