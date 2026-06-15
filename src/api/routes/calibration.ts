// src/api/routes/calibration.ts
// Calibration dashboard, labels (manual + import), and recompute.
// Mounted under /api/calibration (already behind requireAuth).

import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth, requireAdminAuth } from '../auth.js';
import { calibrateExternalGoldenSet, recomputeCalibration, type GoldenItem } from '../calibration-service.js';
import { getPairwiseSummary, runPairwiseCalibration } from '../pairwise-calibration-service.js';

export const calibrationRouter = Router();

interface PairwiseItemInput {
  prompt?: unknown;
  responseA?: unknown;
  responseB?: unknown;
  humanWinner?: unknown;
  modelA?: unknown;
  modelB?: unknown;
  language?: unknown;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function normalizePairwiseItem(it: PairwiseItemInput) {
  const prompt = String(it?.prompt ?? '').trim();
  const responseA = String(it?.responseA ?? '').trim();
  const responseB = String(it?.responseB ?? '').trim();
  const w = String(it?.humanWinner ?? '').trim().toUpperCase();
  const humanWinner = w === 'A' ? 'A' : w === 'B' ? 'B' : w.startsWith('TIE') || w === 'BOTH_BAD' ? 'tie' : null;
  if (!prompt || !responseA || !responseB || !humanWinner) return null;
  return {
    prompt,
    responseA,
    responseB,
    humanWinner,
    modelA: strOrNull(it.modelA),
    modelB: strOrNull(it.modelB),
    language: strOrNull(it.language),
  };
}

interface LabelInput {
  runId?: unknown;
  dimensionId?: unknown;
  humanScore?: unknown;
  notes?: unknown;
}

function normalizeLabel(item: LabelInput): { runId: string; dimensionId: string; humanScore: number; notes: string | null } | null {
  const runId = String(item?.runId ?? '').trim();
  const dimensionId = String(item?.dimensionId ?? '').trim();
  const humanScore = Number(item?.humanScore);
  if (!runId || !dimensionId || !Number.isFinite(humanScore) || humanScore < 0 || humanScore > 10) return null;
  return { runId, dimensionId, humanScore, notes: typeof item?.notes === 'string' ? item.notes : null };
}

// GET /api/calibration — dashboard
calibrationRouter.get('/', async (_req, res) => {
  try {
    const [calibrations, labelCount, datasets] = await Promise.all([
      prisma.judgeCalibration.findMany({ orderBy: [{ judgeModelId: 'asc' }, { dimensionId: 'asc' }] }),
      prisma.calibrationLabel.count(),
      prisma.calibrationDataset.findMany({ orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ calibrations, labelCount, datasets });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/calibration/labels?runId=&source=
calibrationRouter.get('/labels', async (req, res) => {
  try {
    const { runId, source } = req.query;
    const where: { runId?: string; source?: string } = {};
    if (typeof runId === 'string' && runId) where.runId = runId;
    if (typeof source === 'string' && source) where.source = source;
    const labels = await prisma.calibrationLabel.findMany({ where, orderBy: { createdAt: 'desc' }, take: 500 });
    res.json({ labels });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/labels — manual labeling (UI). Body: a label, {labels:[…]}, or an array.
calibrationRouter.post('/labels', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    const body = req.body as { labels?: LabelInput[] } | LabelInput[] | LabelInput;
    const items: LabelInput[] = Array.isArray((body as { labels?: LabelInput[] })?.labels)
      ? (body as { labels: LabelInput[] }).labels
      : Array.isArray(body)
        ? (body as LabelInput[])
        : [body as LabelInput];

    const normalized = items.map(normalizeLabel);
    if (normalized.some((n) => n === null)) {
      return res.status(400).json({ error: 'Each label needs runId, dimensionId, and humanScore between 0 and 10' });
    }

    let created = 0;
    for (const n of normalized) {
      await prisma.calibrationLabel.upsert({
        where: { runId_dimensionId_source: { runId: n!.runId, dimensionId: n!.dimensionId, source: 'manual' } },
        update: { humanScore: n!.humanScore, labeledBy: auth?.userId ?? null, notes: n!.notes },
        create: { runId: n!.runId, dimensionId: n!.dimensionId, source: 'manual', humanScore: n!.humanScore, labeledBy: auth?.userId ?? null, notes: n!.notes },
      });
      created++;
    }
    await recordAuditEventSafe(req, 'calibration.label', undefined, { count: created });
    res.status(201).json({ created });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/import — bulk import a golden set (admin).
// Body: { datasetName?, description?, labels: [{runId, dimensionId, humanScore, notes?}] }
calibrationRouter.post('/import', requireAdminAuth, async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    const body = (req.body ?? {}) as { datasetName?: string; description?: string; labels?: LabelInput[] };
    const items = Array.isArray(body.labels) ? body.labels : [];
    if (items.length === 0) return res.status(400).json({ error: 'labels[] is required' });

    let datasetId: string | null = null;
    if (body.datasetName) {
      const ds = await prisma.calibrationDataset.create({
        data: { name: String(body.datasetName), description: body.description ?? null, source: 'import', createdBy: auth?.userId ?? null },
      });
      datasetId = ds.id;
    }

    let created = 0;
    const skipped: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const n = normalizeLabel(items[i]!);
      if (!n) {
        skipped.push(i);
        continue;
      }
      await prisma.calibrationLabel.upsert({
        where: { runId_dimensionId_source: { runId: n.runId, dimensionId: n.dimensionId, source: 'import' } },
        update: { humanScore: n.humanScore, datasetId, notes: n.notes },
        create: { runId: n.runId, dimensionId: n.dimensionId, source: 'import', humanScore: n.humanScore, datasetId, notes: n.notes },
      });
      created++;
    }
    await recordAuditEventSafe(req, 'calibration.import', datasetId ?? undefined, { created, skipped: skipped.length });
    res.status(201).json({ created, skipped, datasetId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/import-goldenset — calibrate against an external golden set (admin).
// Body: { datasetName?, description?, items: [{ scenarioName?, goal?, attack_type?, domain?, transcript:{turns}, labels:{dim:score} }] }
// Each item runs a full committee evaluation (LLM calls), so this runs in the
// background and returns 202; poll GET /api/calibration for results.
calibrationRouter.post('/import-goldenset', requireAdminAuth, async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    const body = (req.body ?? {}) as { datasetName?: string; description?: string; items?: GoldenItem[] };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'items[] is required' });
    if (items.length > 500) {
      return res.status(400).json({ error: 'Max 500 items per request — split larger golden sets into batches.' });
    }
    const dataset = await prisma.calibrationDataset.create({
      data: { name: String(body.datasetName ?? 'External golden set'), description: body.description ?? null, source: 'import', createdBy: auth?.userId ?? null },
    });
    await recordAuditEventSafe(req, 'calibration.goldenset.start', dataset.id, { items: items.length });
    void calibrateExternalGoldenSet(items, dataset.id)
      .then((r) => console.log(`[calibration] golden set ${dataset.id}: ${r.judges} rows / ${r.samples} samples / ${r.items} items`))
      .catch((e) => console.error(`[calibration] golden set ${dataset.id} failed: ${(e as Error).message}`));
    res.status(202).json({ datasetId: dataset.id, items: items.length, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/recompute — recompute κ for a dataset (or global).
calibrationRouter.post('/recompute', async (req, res) => {
  try {
    const datasetId = typeof (req.body as { datasetId?: string })?.datasetId === 'string'
      ? (req.body as { datasetId: string }).datasetId
      : undefined;
    const result = await recomputeCalibration(datasetId);
    await recordAuditEventSafe(req, 'calibration.recompute', datasetId, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Pairwise calibration (LMSYS Chatbot Arena) ───────────────────────────────

// GET /api/calibration/pairwise — per-judge pairwise agreement + datasets
calibrationRouter.get('/pairwise', async (_req, res) => {
  try {
    res.json(await getPairwiseSummary());
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/pairwise/import — import pairwise items (admin).
// Body: { datasetName?, description?, source?, items: [{ prompt, responseA, responseB, humanWinner, modelA?, modelB?, language? }] }
calibrationRouter.post('/pairwise/import', requireAdminAuth, async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    const body = (req.body ?? {}) as { datasetName?: string; description?: string; source?: string; items?: PairwiseItemInput[] };
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return res.status(400).json({ error: 'items[] is required' });
    if (rawItems.length > 1000) return res.status(400).json({ error: 'Max 1000 items per request — split into batches.' });

    const valid = rawItems.map(normalizePairwiseItem).filter((n): n is NonNullable<typeof n> => n !== null);
    if (valid.length === 0) {
      return res.status(400).json({ error: 'No valid items (each needs prompt, responseA, responseB, humanWinner = A|B|tie)' });
    }

    const dataset = await prisma.pairwiseDataset.create({
      data: {
        name: String(body.datasetName ?? 'LMSYS Chatbot Arena'),
        description: body.description ?? null,
        source: body.source === 'lmsys-arena' ? 'lmsys-arena' : 'import',
        createdBy: auth?.userId ?? null,
      },
    });
    await prisma.pairwiseItem.createMany({ data: valid.map((v) => ({ ...v, datasetId: dataset.id })) });
    await recordAuditEventSafe(req, 'calibration.pairwise.import', dataset.id, { created: valid.length, skipped: rawItems.length - valid.length });
    res.status(201).json({ datasetId: dataset.id, created: valid.length, skipped: rawItems.length - valid.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/calibration/pairwise/run — score items with the committee (admin, background).
calibrationRouter.post('/pairwise/run', requireAdminAuth, async (req, res) => {
  try {
    const datasetId = String((req.body as { datasetId?: string })?.datasetId ?? '').trim();
    if (!datasetId) return res.status(400).json({ error: 'datasetId is required' });
    const ds = await prisma.pairwiseDataset.findUnique({ where: { id: datasetId } });
    if (!ds) return res.status(404).json({ error: 'dataset not found' });

    await recordAuditEventSafe(req, 'calibration.pairwise.run', datasetId, {});
    void runPairwiseCalibration(datasetId)
      .then((r) => console.log(`[calibration] pairwise ${datasetId}: ${r.judges} judges / ${r.items} items / ${r.verdicts} verdicts`))
      .catch((e) => console.error(`[calibration] pairwise ${datasetId} failed: ${(e as Error).message}`));
    res.status(202).json({ datasetId, status: 'processing' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
