// src/api/routes/calibration.ts
// Calibration dashboard, labels (manual + import), and recompute.
// Mounted under /api/calibration (already behind requireAuth).

import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth, requireAdminAuth } from '../auth.js';
import { recomputeCalibration } from '../calibration-service.js';

export const calibrationRouter = Router();

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
