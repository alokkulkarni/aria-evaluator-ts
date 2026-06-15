// src/api/lmsys-import.ts
// Server-side import of the LMSYS Chatbot Arena pairwise dataset, powering the
// "Import from LMSYS" button and the first-run auto-seed. Replaces the standalone
// CLI loader (scripts/load-lmsys-arena.ts). The dataset is gated on HuggingFace,
// so a token (HUGGINGFACE_TOKEN setting/env) is required to fetch it.

import { prisma } from '../db/client.js';
import { getEffectiveSettings } from './runtime-settings.js';

const HF_DATASET = 'lmsys/chatbot_arena_conversations';
const HF_ROWS_URL = 'https://datasets-server.huggingface.co/rows';
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export class MissingHuggingFaceTokenError extends Error {
  constructor() {
    super(
      'No HuggingFace token configured. Add HUGGINGFACE_TOKEN in Settings (create a free token at ' +
        'https://huggingface.co/settings/tokens and accept the dataset terms at ' +
        'https://huggingface.co/datasets/lmsys/chatbot_arena_conversations) to import the gated LMSYS dataset.',
    );
    this.name = 'MissingHuggingFaceTokenError';
  }
}

interface Turn {
  role?: string;
  content?: string;
}
interface ArenaRow {
  conversation_a?: Turn[];
  conversation_b?: Turn[];
  model_a?: string;
  model_b?: string;
  winner?: string;
  turn?: number;
  language?: string;
}
interface MappedItem {
  prompt: string;
  responseA: string;
  responseB: string;
  humanWinner: 'A' | 'B' | 'tie';
  modelA: string | null;
  modelB: string | null;
  language: string | null;
}

function firstWith(turns: Turn[] | undefined, role: string): string {
  return (turns ?? []).find((t) => t?.role === role)?.content?.trim() ?? '';
}

function mapRow(row: ArenaRow, includeTies: boolean): MappedItem | null {
  if ((row.turn ?? 1) !== 1) return null; // single-turn only (v1)
  if (row.language && row.language !== 'English') return null;

  const prompt = firstWith(row.conversation_a, 'user');
  const responseA = firstWith(row.conversation_a, 'assistant');
  const responseB = firstWith(row.conversation_b, 'assistant');
  if (!prompt || !responseA || !responseB) return null;

  const w = (row.winner ?? '').toLowerCase();
  let humanWinner: 'A' | 'B' | 'tie';
  if (w === 'model_a') humanWinner = 'A';
  else if (w === 'model_b') humanWinner = 'B';
  else if (w.startsWith('tie')) {
    if (!includeTies) return null;
    humanWinner = 'tie';
  } else return null;

  return {
    prompt,
    responseA,
    responseB,
    humanWinner,
    modelA: row.model_a ?? null,
    modelB: row.model_b ?? null,
    language: row.language ?? null,
  };
}

async function fetchRows(token: string, offset: number, length: number): Promise<ArenaRow[]> {
  const url = `${HF_ROWS_URL}?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train&offset=${offset}&length=${length}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    throw new Error(`HuggingFace rows API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  }
  const data = (await resp.json()) as { rows?: Array<{ row: ArenaRow }> };
  return (data.rows ?? []).map((r) => r.row);
}

export function huggingFaceTokenConfigured(): boolean {
  return Boolean(getEffectiveSettings()['HUGGINGFACE_TOKEN']?.trim());
}

/**
 * Fetch a sample of LMSYS Chatbot Arena pairwise comparisons from HuggingFace and
 * store them as a fresh pairwise dataset. Any prior LMSYS import is replaced (the
 * cascade clears its items/verdicts/calibration rows) so repeated calls "refresh"
 * rather than accumulate. Throws MissingHuggingFaceTokenError if no token is set.
 */
export async function importLmsysArena(
  opts: { limit?: number; includeTies?: boolean } = {},
): Promise<{ datasetId: string; created: number }> {
  const token = getEffectiveSettings()['HUGGINGFACE_TOKEN']?.trim();
  if (!token) throw new MissingHuggingFaceTokenError();

  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
  const includeTies = opts.includeTies ?? false;

  const items: MappedItem[] = [];
  let offset = 0;
  const page = 100;
  while (items.length < limit && offset < 50_000) {
    const rows = await fetchRows(token, offset, page);
    if (rows.length === 0) break;
    for (const row of rows) {
      const m = mapRow(row, includeTies);
      if (m) items.push(m);
      if (items.length >= limit) break;
    }
    offset += page;
  }
  if (items.length === 0) {
    throw new Error('No usable single-turn English items were returned from the LMSYS dataset.');
  }

  await prisma.pairwiseDataset.deleteMany({ where: { source: 'lmsys-arena' } });
  const dataset = await prisma.pairwiseDataset.create({
    data: {
      name: `LMSYS Chatbot Arena (${items.length})`,
      source: 'lmsys-arena',
      description: 'Imported from HuggingFace lmsys/chatbot_arena_conversations',
    },
  });
  await prisma.pairwiseItem.createMany({ data: items.map((v) => ({ ...v, datasetId: dataset.id })) });
  return { datasetId: dataset.id, created: items.length };
}

/**
 * First-run seed: if no pairwise dataset exists yet and a HuggingFace token is
 * configured, import an LMSYS sample in the background. No-op (with a hint) when
 * no token is set — the gated dataset cannot be fetched without one. Safe to call
 * on every startup; it does nothing once a dataset exists.
 */
export async function seedPairwiseDatasetIfNeeded(): Promise<void> {
  try {
    if ((await prisma.pairwiseDataset.count()) > 0) return;
    if (!huggingFaceTokenConfigured()) {
      console.log(
        '[calibration] No pairwise dataset and no HUGGINGFACE_TOKEN set — skipping LMSYS auto-import. ' +
          'Add a token in Settings, then click "Import from LMSYS" on the Calibration page.',
      );
      return;
    }
    console.log('[calibration] No pairwise dataset found — auto-importing an LMSYS sample…');
    const r = await importLmsysArena({ limit: DEFAULT_LIMIT });
    console.log(`[calibration] Auto-imported ${r.created} LMSYS items (dataset ${r.datasetId}).`);
  } catch (e) {
    console.error(`[calibration] LMSYS auto-import skipped: ${(e as Error).message}`);
  }
}
