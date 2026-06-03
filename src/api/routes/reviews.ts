// src/api/routes/reviews.ts
// Review queue and judge calibration endpoints.
//
// Status transitions:
//   pending → in_review  (reviewer picks it up)
//   in_review → approved   (AI score confirmed; no override needed)
//   in_review → overridden (human score differs from AI)
//   in_review → rejected   (run excluded from calibration — e.g. bad data)
//   Any terminal state → in_review is NOT allowed without an explicit re-queue.

import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth } from '../auth.js';

export const reviewsRouter = Router();

// Valid status values and allowed forward transitions
const VALID_STATUSES = new Set(['pending', 'in_review', 'approved', 'overridden', 'rejected']);
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending:    new Set(['in_review']),
  in_review:  new Set(['approved', 'overridden', 'rejected', 'in_review']),
  approved:   new Set(['in_review']), // allow re-open for correction
  overridden: new Set(['in_review']),
  rejected:   new Set(['in_review']),
};

function isValidTransition(from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

function validateDimensionOverrides(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    throw new Error('dimensionOverridesJson must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('dimensionOverridesJson must be a JSON object');
  }
  for (const [dimId, val] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof val !== 'object' || val === null) {
      throw new Error(`dimensionOverrides["${dimId}"] must be an object with score and notes`);
    }
    const entry = val as Record<string, unknown>;
    if (typeof entry['score'] !== 'number' || entry['score'] < 0 || entry['score'] > 10) {
      throw new Error(`dimensionOverrides["${dimId}"].score must be a number between 0 and 10`);
    }
    if (entry['notes'] !== undefined && typeof entry['notes'] !== 'string') {
      throw new Error(`dimensionOverrides["${dimId}"].notes must be a string`);
    }
  }
  return JSON.stringify(parsed);
}

// ─── GET /api/reviews ─────────────────────────────────────────────────────────
// List review queue, optionally filtered by ?status=pending|in_review|...
// Excludes reviews whose run has been soft-deleted.
reviewsRouter.get('/', async (req, res) => {
  try {
    const rawStatus = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
    if (rawStatus !== undefined && !VALID_STATUSES.has(rawStatus)) {
      return res.status(400).json({ error: `Invalid status filter. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
    }

    const page = Math.max(1, parseInt(String(req.query['page'] ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'), 10) || 50));
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: {
          ...(rawStatus ? { status: rawStatus } : {}),
          // Exclude reviews for soft-deleted runs
          evalResult: { run: { NOT: { status: 'deleted' } } },
        },
        include: {
          evalResult: {
            select: {
              id: true,
              overallScore: true,
              passed: true,
              summary: true,
              judgeModel: true,
              scenarioType: true,
              dimensionScores: true,
              createdAt: true,
            },
          },
          reviewer: { select: { id: true, username: true } },
        },
        orderBy: { queuedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.review.count({
        where: {
          ...(rawStatus ? { status: rawStatus } : {}),
          evalResult: { run: { NOT: { status: 'deleted' } } },
        },
      }),
    ]);

    // Augment each review with minimal run context (scenarioName, status, channel)
    const runIds = [...new Set(reviews.map((r) => r.runId))];
    const runs = await prisma.run.findMany({
      where: { id: { in: runIds } },
      select: { id: true, scenarioName: true, status: true, channel: true, createdAt: true },
    });
    const runMap = new Map(runs.map((r) => [r.id, r]));

    res.json({
      reviews: reviews.map((r) => ({ ...r, run: runMap.get(r.runId) ?? null })),
      total,
      page,
      limit,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/reviews/:id ─────────────────────────────────────────────────────
// Single review with full run + turns + evalResult context.
reviewsRouter.get('/:id', async (req, res) => {
  try {
    const review = await prisma.review.findUnique({
      where: { id: req.params['id']! },
      include: {
        evalResult: true,
        reviewer: { select: { id: true, username: true } },
      },
    });
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const run = await prisma.run.findFirst({
      where: { id: review.runId, NOT: { status: 'deleted' } },
      include: { turns: { orderBy: { index: 'asc' } } },
    });

    res.json({ review, run });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── POST /api/reviews ────────────────────────────────────────────────────────
// Queue a run for review. Body: { runId: string, notes?: string }
// Creates a Review record linked to the run's EvalResult.
// Returns 409 if a review already exists for this run.
reviewsRouter.post('/', async (req, res) => {
  try {
    const { runId, notes } = req.body as { runId?: string; notes?: string };
    if (!runId || typeof runId !== 'string') {
      return res.status(400).json({ error: 'runId is required' });
    }

    // Validate run exists, is not deleted, and has an eval result
    const run = await prisma.run.findFirst({
      where: { id: runId, NOT: { status: 'deleted' } },
      select: { id: true, scenarioName: true },
    });
    if (!run) return res.status(404).json({ error: 'Run not found or has been deleted' });

    const evalResult = await prisma.evalResult.findUnique({ where: { runId } });
    if (!evalResult) {
      return res.status(422).json({ error: 'Run has no evaluation result — evaluate it first' });
    }

    // Detect duplicate (will also be caught by unique constraint, but give a 409 explicitly)
    const existing = await prisma.review.findUnique({ where: { evalResultId: evalResult.id } });
    if (existing) {
      return res.status(409).json({ error: 'A review for this run already exists', reviewId: existing.id });
    }

    const review = await prisma.review.create({
      data: {
        evalResultId: evalResult.id,
        runId,
        status: 'pending',
        notes: notes ?? null,
      },
    });

    await recordAuditEventSafe(req, 'review.queue', runId, { reviewId: review.id });
    res.status(201).json({ review });
  } catch (err) {
    // Catch unique constraint violation race
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A review for this run already exists' });
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── PATCH /api/reviews/:id ───────────────────────────────────────────────────
// Update a review: status, scoreOverride, passedOverride, notes, dimensionOverridesJson.
// Status transitions are validated. scoreOverride must be 0–10.
reviewsRouter.patch('/:id', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    const reviewId = req.params['id']!;

    const existing = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });

    const body = req.body as {
      status?: string;
      scoreOverride?: number | null;
      passedOverride?: boolean | null;
      notes?: string | null;
      dimensionOverridesJson?: string | null;
    };

    // Validate status transition
    if (body.status !== undefined) {
      if (!VALID_STATUSES.has(body.status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
      }
      if (!isValidTransition(existing.status, body.status)) {
        return res.status(422).json({
          error: `Status transition "${existing.status}" → "${body.status}" is not allowed`,
        });
      }
    }

    // Validate scoreOverride range
    if (body.scoreOverride !== undefined && body.scoreOverride !== null) {
      if (typeof body.scoreOverride !== 'number' || body.scoreOverride < 0 || body.scoreOverride > 10) {
        return res.status(400).json({ error: 'scoreOverride must be a number between 0 and 10' });
      }
    }

    // Validate and normalize dimensionOverridesJson
    let dimensionOverridesJson: string | null | undefined = undefined;
    if (body.dimensionOverridesJson !== undefined) {
      try {
        dimensionOverridesJson = validateDimensionOverrides(body.dimensionOverridesJson);
      } catch (validationErr) {
        return res.status(400).json({ error: (validationErr as Error).message });
      }
    }

    const newStatus = body.status ?? existing.status;
    const isTerminal = newStatus === 'approved' || newStatus === 'overridden' || newStatus === 'rejected';

    const updated = await prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(body.status !== undefined && { status: body.status }),
        ...(body.scoreOverride !== undefined && { scoreOverride: body.scoreOverride }),
        ...(body.passedOverride !== undefined && { passedOverride: body.passedOverride }),
        ...(body.notes !== undefined && { notes: body.notes }),
        ...(dimensionOverridesJson !== undefined && { dimensionOverridesJson }),
        ...(isTerminal && existing.reviewedAt == null && {
          reviewedBy: auth?.userId ?? null,
          reviewedAt: new Date(),
        }),
      },
    });

    await recordAuditEventSafe(req, 'review.update', reviewId, {
      oldStatus: existing.status,
      newStatus: updated.status,
      scoreOverride: updated.scoreOverride,
    });

    res.json({ review: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── DELETE /api/reviews/:id ──────────────────────────────────────────────────
// Hard-delete a review (e.g. erroneous queue entry). Admin action.
reviewsRouter.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.review.findUnique({ where: { id: req.params['id']! } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });

    await prisma.review.delete({ where: { id: req.params['id']! } });
    await recordAuditEventSafe(req, 'review.delete', req.params['id']!, { runId: existing.runId });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── GET /api/reviews/calibration/summary ─────────────────────────────────────
// Aggregate calibration statistics: AI vs human score agreement.
// Returns summary stats across all completed (approved/overridden) reviews.
reviewsRouter.get('/calibration/summary', async (_req, res) => {
  try {
    const completed = await prisma.review.findMany({
      where: {
        status: { in: ['approved', 'overridden', 'rejected'] },
        evalResult: { run: { NOT: { status: 'deleted' } } },
      },
      select: {
        id: true,
        status: true,
        scoreOverride: true,
        passedOverride: true,
        dimensionOverridesJson: true,
        evalResult: {
          select: {
            overallScore: true,
            passed: true,
            dimensionScores: true,
            scenarioType: true,
          },
        },
      },
    });

    const total = await prisma.review.count();
    const byStatus = {
      pending: await prisma.review.count({ where: { status: 'pending' } }),
      in_review: await prisma.review.count({ where: { status: 'in_review' } }),
      approved: await prisma.review.count({ where: { status: 'approved' } }),
      overridden: await prisma.review.count({ where: { status: 'overridden' } }),
      rejected: await prisma.review.count({ where: { status: 'rejected' } }),
    };

    // Compute score disagreement stats for overridden reviews
    const overridden = completed.filter((r) => r.status === 'overridden' && r.scoreOverride !== null);
    let avgAiScore: number | null = null;
    let avgHumanScore: number | null = null;
    let avgDisagreement: number | null = null;
    let agreementRate: number | null = null;

    if (overridden.length > 0) {
      const aiScores = overridden.map((r) => r.evalResult.overallScore);
      const humanScores = overridden.map((r) => r.scoreOverride as number);
      const disagreements = overridden.map((r, i) => Math.abs(aiScores[i]! - humanScores[i]!));

      avgAiScore = aiScores.reduce((a, b) => a + b, 0) / aiScores.length;
      avgHumanScore = humanScores.reduce((a, b) => a + b, 0) / humanScores.length;
      avgDisagreement = disagreements.reduce((a, b) => a + b, 0) / disagreements.length;
    }

    if (completed.length > 0) {
      const agreedCount = completed.filter((r) => r.status === 'approved').length;
      agreementRate = agreedCount / completed.length;
    }

    // Per-dimension disagreement (where dimension overrides exist)
    const dimensionStats: Record<string, { aiAvg: number; humanAvg: number; disagreementAvg: number; count: number }> = {};
    for (const review of overridden) {
      if (!review.dimensionOverridesJson) continue;
      let overrides: Record<string, { score: number; notes?: string }>;
      try {
        overrides = JSON.parse(review.dimensionOverridesJson) as Record<string, { score: number; notes?: string }>;
      } catch {
        continue;
      }
      let aiDims: Record<string, { score: number }>;
      try {
        aiDims = JSON.parse(review.evalResult.dimensionScores) as Record<string, { score: number }>;
      } catch {
        continue;
      }
      for (const [dimId, humanDim] of Object.entries(overrides)) {
        const aiDim = aiDims[dimId];
        if (!aiDim) continue;
        const existing = dimensionStats[dimId] ?? { aiAvg: 0, humanAvg: 0, disagreementAvg: 0, count: 0 };
        const n = existing.count;
        dimensionStats[dimId] = {
          aiAvg: (existing.aiAvg * n + aiDim.score) / (n + 1),
          humanAvg: (existing.humanAvg * n + humanDim.score) / (n + 1),
          disagreementAvg: (existing.disagreementAvg * n + Math.abs(aiDim.score - humanDim.score)) / (n + 1),
          count: n + 1,
        };
      }
    }

    res.json({
      total,
      byStatus,
      agreementRate: agreementRate !== null ? Math.round(agreementRate * 100) / 100 : null,
      avgAiScore: avgAiScore !== null ? Math.round(avgAiScore * 10) / 10 : null,
      avgHumanScore: avgHumanScore !== null ? Math.round(avgHumanScore * 10) / 10 : null,
      avgDisagreement: avgDisagreement !== null ? Math.round(avgDisagreement * 10) / 10 : null,
      overriddenCount: overridden.length,
      completedCount: completed.length,
      dimensionStats,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
