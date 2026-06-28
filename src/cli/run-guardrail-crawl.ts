#!/usr/bin/env node
// Local trigger for the Guardrail Advisor doc crawl — the on-prem equivalent of the
// scheduled Lambda. Runs the same runCrawl() orchestration against the configured
// DATABASE_URL, embedding via AWS Bedrock Titan (needs AWS creds with Titan access).
//
//   npm run cli:guardrail-crawl
//   # or inside the local stack container:
//   docker compose exec aria-evaluator node dist/cli/run-guardrail-crawl.js
import { runCrawl } from '../rag/crawl-runner.js';

try {
  const summaries = await runCrawl();
  console.log(`\nGuardrail crawl complete:\n${JSON.stringify(summaries, null, 2)}`);
  process.exit(0);
} catch (err) {
  console.error(`Guardrail crawl failed: ${(err as Error).message}`);
  process.exit(1);
}
