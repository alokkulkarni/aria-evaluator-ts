#!/usr/bin/env node
// Load a sample of the LMSYS Chatbot Arena dataset into the pairwise calibration
// track. Run locally with YOUR OWN HuggingFace token (you accept the dataset's
// terms). The dataset is NOT bundled with this repo.
//
//   HF_TOKEN=hf_xxx ARIA_AUTH_COOKIE='access_token=...' \
//     npx tsx scripts/load-lmsys-arena.ts --limit 200 --base-url http://localhost:3001
//
// Auth for the import endpoint (admin): provide EITHER
//   ARIA_AUTH_COOKIE  — copy the Cookie header from your logged-in browser, or
//   ARIA_ADMIN_TOKEN  — a bearer access token.

import { parseArgs } from 'node:util';

const HF_DATASET = 'lmsys/chatbot_arena_conversations';
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';

const { values } = parseArgs({
  options: {
    limit: { type: 'string', default: '200' },
    'base-url': { type: 'string', default: process.env['ARIA_BASE_URL'] ?? 'http://localhost:3001' },
    'english-only': { type: 'boolean', default: true },
    'include-ties': { type: 'boolean', default: false },
    'dataset-name': { type: 'string', default: 'LMSYS Chatbot Arena' },
  },
});

const limit = Number(values.limit) || 200;
const baseUrl = String(values['base-url']).replace(/\/$/, '');
const hfToken = process.env['HF_TOKEN'] ?? process.env['HUGGINGFACE_TOKEN'];
const authCookie = process.env['ARIA_AUTH_COOKIE'];
const adminToken = process.env['ARIA_ADMIN_TOKEN'];

if (!hfToken) {
  console.error('Set HF_TOKEN — a HuggingFace token with access to the gated dataset (accept terms at https://huggingface.co/datasets/lmsys/chatbot_arena_conversations).');
  process.exit(1);
}
if (!authCookie && !adminToken) {
  console.error('Set ARIA_AUTH_COOKIE or ARIA_ADMIN_TOKEN — the import endpoint requires an admin session.');
  process.exit(1);
}

interface Turn { role?: string; content?: string }
interface ArenaRow {
  conversation_a?: Turn[];
  conversation_b?: Turn[];
  model_a?: string;
  model_b?: string;
  winner?: string;
  turn?: number;
  language?: string;
}
interface PairwiseItem {
  prompt: string;
  responseA: string;
  responseB: string;
  humanWinner: 'A' | 'B' | 'tie';
  modelA: string | null;
  modelB: string | null;
  language: string | null;
}

const firstWith = (turns: Turn[] | undefined, role: string): string =>
  (turns ?? []).find((t) => t?.role === role)?.content?.trim() ?? '';

function mapRow(row: ArenaRow): PairwiseItem | null {
  if ((row.turn ?? 1) !== 1) return null; // single-turn only (v1)
  if (values['english-only'] && row.language && row.language !== 'English') return null;

  const prompt = firstWith(row.conversation_a, 'user');
  const responseA = firstWith(row.conversation_a, 'assistant');
  const responseB = firstWith(row.conversation_b, 'assistant');
  if (!prompt || !responseA || !responseB) return null;

  const w = (row.winner ?? '').toLowerCase();
  let humanWinner: 'A' | 'B' | 'tie';
  if (w === 'model_a') humanWinner = 'A';
  else if (w === 'model_b') humanWinner = 'B';
  else if (w.startsWith('tie')) {
    if (!values['include-ties']) return null;
    humanWinner = 'tie';
  } else return null;

  return { prompt, responseA, responseB, humanWinner, modelA: row.model_a ?? null, modelB: row.model_b ?? null, language: row.language ?? null };
}

async function fetchRows(offset: number, length: number): Promise<ArenaRow[]> {
  const url = `${HF_ROWS_URL}?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train&offset=${offset}&length=${length}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${hfToken}` } });
  if (!resp.ok) throw new Error(`HF rows API ${resp.status}: ${await resp.text()}`);
  const data = (await resp.json()) as { rows?: Array<{ row: ArenaRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

async function main(): Promise<void> {
  console.log(`Fetching up to ${limit} usable items from ${HF_DATASET}...`);
  const items: PairwiseItem[] = [];
  let offset = 0;
  const page = 100;
  while (items.length < limit && offset < 50_000) {
    const rows = await fetchRows(offset, page);
    if (rows.length === 0) break;
    for (const row of rows) {
      const m = mapRow(row);
      if (m) items.push(m);
      if (items.length >= limit) break;
    }
    offset += page;
    process.stdout.write(`\r  collected ${items.length}/${limit} (scanned ${offset})`);
  }
  console.log(`\nPosting ${items.length} items to ${baseUrl}/api/calibration/pairwise/import ...`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authCookie) headers['Cookie'] = authCookie;
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

  const resp = await fetch(`${baseUrl}/api/calibration/pairwise/import`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ datasetName: values['dataset-name'], source: 'lmsys-arena', items }),
  });
  const txt = await resp.text();
  if (!resp.ok) {
    console.error(`Import failed (${resp.status}): ${txt}`);
    process.exit(1);
  }
  console.log(`Imported: ${txt}`);
  console.log('Next: open the Calibration screen and click "Run pairwise calibration".');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
