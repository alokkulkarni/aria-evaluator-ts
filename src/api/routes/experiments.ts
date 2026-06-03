import express, { type Request, type Response } from 'express';
import { prisma } from '../../db/client.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth, requireAdminAuth } from '../auth.js';

export const experimentsRouter = express.Router();

/**
 * POST /api/experiments
 * Create a new experiment with legs
 * Admin only
 */
experimentsRouter.post('/', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { name, scenarioId, description, legs } = req.body as {
      name?: string;
      scenarioId?: string;
      description?: string;
      legs?: Array<{ name: string; configJson: string; targetRunCount?: number }>;
    };

    // Validate input
    if (!name || !scenarioId || !legs || legs.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields: name, scenarioId, legs (non-empty array)',
      });
    }

    // Verify scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    // Validate leg configs are parseable JSON
    for (const leg of legs) {
      try {
        JSON.parse(leg.configJson);
      } catch {
        return res
          .status(400)
          .json({ error: `Invalid JSON in leg config: ${leg.name}` });
      }
    }

    const auth = getRequestAuth(req);
    const userId = auth?.userId;

    // Create experiment with legs
    const experiment = await prisma.experiment.create({
      data: {
        name,
        scenarioId,
        description,
        status: 'planning',
        createdBy: userId,
        legs: {
          create: legs.map((l) => ({
            name: l.name,
            configJson: l.configJson,
            targetRunCount: l.targetRunCount,
          })),
        },
      },
      include: { legs: true },
    });

    // Audit log
    await recordAuditEventSafe(req, 'experiment.created', experiment.id, {
      name,
      scenarioId,
      legCount: legs.length,
    });

    return res.status(201).json({
      id: experiment.id,
      name: experiment.name,
      scenarioId: experiment.scenarioId,
      status: experiment.status,
      legs: experiment.legs,
      createdAt: experiment.createdAt,
    });
  } catch (error) {
    console.error('POST /api/experiments error:', error);
    return res.status(500).json({ error: 'Failed to create experiment' });
  }
});

/**
 * GET /api/experiments
 * List experiments (optionally filter by scenario, status)
 */
experimentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { scenarioId, status, limit = '50' } = req.query as {
      scenarioId?: string;
      status?: string;
      limit?: string;
    };

    const take = Math.min(parseInt(limit, 10) || 50, 100);

    // Build filter
    const where: any = {};
    if (scenarioId) where.scenarioId = scenarioId;
    if (status) where.status = status;

    const experiments = await prisma.experiment.findMany({
      where,
      include: {
        legs: true,
        experimentRuns: {
          include: {
            leg: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    // Compute per-leg stats
    const response = experiments.map((exp: any) => {
      const legStats: Record<string, any> = {};
      for (const leg of exp.legs) {
        const runsInLeg = exp.experimentRuns.filter((er: any) => er.legId === leg.id);
        legStats[leg.id] = {
          id: leg.id,
          name: leg.name,
          runCount: runsInLeg.length,
          targetRunCount: leg.targetRunCount,
        };
      }

      return {
        id: exp.id,
        name: exp.name,
        scenarioId: exp.scenarioId,
        status: exp.status,
        legCount: exp.legs.length,
        totalRunCount: exp.experimentRuns.length,
        legs: legStats,
        createdAt: exp.createdAt,
      };
    });

    return res.json(response);
  } catch (error) {
    console.error('GET /api/experiments error:', error);
    return res.status(500).json({ error: 'Failed to list experiments' });
  }
});

/**
 * GET /api/experiments/:id
 * Retrieve experiment details with leg stats
 */
experimentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        legs: true,
        experimentRuns: {
          include: { leg: true },
        },
        scenario: {
          select: { name: true, channel: true },
        },
      },
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Compute leg stats
    const legStats = [];
    for (const leg of experiment.legs) {
      const runsInLeg = experiment.experimentRuns.filter((er: any) => er.legId === leg.id);
      legStats.push({
        id: leg.id,
        name: leg.name,
        configJson: leg.configJson,
        description: leg.description,
        targetRunCount: leg.targetRunCount,
        runCount: runsInLeg.length,
      });
    }

    return res.json({
      id: experiment.id,
      name: experiment.name,
      scenarioId: experiment.scenarioId,
      scenario: experiment.scenario,
      description: experiment.description,
      status: experiment.status,
      legs: legStats,
      totalRunCount: experiment.experimentRuns.length,
      createdAt: experiment.createdAt,
      updatedAt: experiment.updatedAt,
    });
  } catch (error) {
    console.error('GET /api/experiments/:id error:', error);
    return res.status(500).json({ error: 'Failed to retrieve experiment' });
  }
});

/**
 * POST /api/experiments/:id/runs
 * Assign a run to an experiment leg
 * Admin only
 */
experimentsRouter.post(
  '/:id/runs',
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params as { id: string };
      const { runId, legId, tags } = req.body as {
        runId?: string;
        legId?: string;
        tags?: string[];
      };

      // Validate input
      if (!runId || !legId) {
        return res
          .status(400)
          .json({ error: 'Missing required fields: runId, legId' });
      }

      // Verify experiment exists
      const experiment = await prisma.experiment.findUnique({
        where: { id },
        include: { legs: true },
      });
      if (!experiment) {
        return res.status(404).json({ error: 'Experiment not found' });
      }

      // Verify leg exists and belongs to experiment
      const leg = experiment.legs.find((l: any) => l.id === legId);
      if (!leg) {
        return res.status(404).json({ error: 'Leg not found in this experiment' });
      }

      // Verify run exists
      const run = await prisma.run.findUnique({
        where: { id: runId },
      });
      if (!run) {
        return res.status(404).json({ error: 'Run not found' });
      }

      // Verify scenario matches
      if (run.scenarioId !== experiment.scenarioId) {
        return res.status(400).json({
          error: `Run scenario (${run.scenarioId}) does not match experiment scenario (${experiment.scenarioId})`,
        });
      }

      // Verify experiment is not archived
      if (experiment.status === 'archived') {
        return res
          .status(400)
          .json({ error: 'Cannot assign runs to archived experiments' });
      }

      // Assign run to leg
      // Note: runId has a global unique constraint, so only one experiment per run
      try {
        const experimentRun = await prisma.experimentRun.create({
          data: {
            experimentId: id,
            runId,
            legId,
            tagsJson: tags ? JSON.stringify(tags) : null,
          },
        });

        const auth = getRequestAuth(req);

        // Audit log
        await recordAuditEventSafe(req, 'experiment.run.assigned', id, {
          runId,
          legId,
          experimentName: experiment.name,
          legName: leg.name,
        });

        return res.status(201).json(experimentRun);
      } catch (error: any) {
        // Handle Prisma unique constraint violation (P2002)
        if (error?.code === 'P2002') {
          return res.status(409).json({
            error: 'Run is already assigned to another experiment',
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('POST /api/experiments/:id/runs error:', error);
      return res.status(500).json({ error: 'Failed to assign run to experiment' });
    }
  }
);

/**
 * DELETE /api/experiments/:id
 * Archive an experiment (soft delete)
 * Admin only
 */
experimentsRouter.delete('/:id', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };

    const experiment = await prisma.experiment.findUnique({
      where: { id },
    });
    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Soft delete via status
    const updated = await prisma.experiment.update({
      where: { id },
      data: { status: 'archived' },
    });

    const auth = getRequestAuth(req);

    // Audit log
    await recordAuditEventSafe(req, 'experiment.archived', id, {
      name: experiment.name,
    });

    return res.json({
      message: 'Experiment archived successfully',
      id: updated.id,
      status: updated.status,
    });
  } catch (error) {
    console.error('DELETE /api/experiments/:id error:', error);
    return res.status(500).json({ error: 'Failed to archive experiment' });
  }
});

/**
 * GET /api/experiments/:id/comparison
 * Compare metrics across experiment legs
 * Returns per-leg metrics and deltas
 */
experimentsRouter.get('/:id/comparison', async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const { baselineLegs } = req.query as { baselineLegs?: string };

    const experiment = await prisma.experiment.findUnique({
      where: { id },
      include: {
        legs: true,
        experimentRuns: {
          include: {
            leg: true,
          },
        },
      },
    });

    if (!experiment) {
      return res.status(404).json({ error: 'Experiment not found' });
    }

    // Fetch eval results for all runs in experiment
    const runIds = experiment.experimentRuns.map((er: any) => er.runId);
    const evalResults = await prisma.evalResult.findMany({
      where: {
        runId: {
          in: runIds,
        },
      },
      select: {
        runId: true,
        overallScore: true,
        passed: true,
        dimensionScores: true,
        createdAt: true,
      },
    });

    // Build map: runId -> evalResult
    const evalMap = new Map(evalResults.map((er: any) => [er.runId, er]));

    // Compute per-leg metrics
    const legMetrics: Record<string, any> = {};
    for (const leg of experiment.legs) {
      const runsInLeg = experiment.experimentRuns.filter(
        (er: any) => er.legId === leg.id
      );
      const evalsInLeg = runsInLeg
        .map((er: any) => evalMap.get(er.runId))
        .filter((e: any) => e !== undefined);

      if (evalsInLeg.length === 0) {
        legMetrics[leg.id] = {
          id: leg.id,
          name: leg.name,
          runCount: 0,
          passRate: null,
          avgScore: null,
          avgLatencyMs: null,
          dimensionMetrics: {},
        };
      } else {
        // Compute pass rate
        const passCount = evalsInLeg.filter((e: any) => e.passed).length;
        const passRate = passCount / evalsInLeg.length;

        // Compute average score
        const totalScore = evalsInLeg.reduce(
          (sum: number, e: any) => sum + (e.overallScore || 0),
          0
        );
        const avgScore = totalScore / evalsInLeg.length;

        // Compute dimension metrics (reuse logic from Phase 6)
        const dimensionMetrics: Record<string, any> = {};
        for (const evalResult of evalsInLeg) {
          if (evalResult.dimensionScores) {
            try {
              const dims = JSON.parse(evalResult.dimensionScores) as Record<
                string,
                { score: number }
              >;
              for (const [dimId, dimData] of Object.entries(dims)) {
                if (!dimensionMetrics[dimId]) {
                  dimensionMetrics[dimId] = { scores: [] };
                }
                if (dimData?.score !== undefined) {
                  dimensionMetrics[dimId].scores.push(dimData.score);
                }
              }
            } catch {
              // Skip malformed
            }
          }
        }

        // Compute dimension stats
        const dimensionStats: Record<string, any> = {};
        for (const [dimId, data] of Object.entries(dimensionMetrics)) {
          const scores = (data as any).scores || [];
          if (scores.length > 0) {
            const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
            const variance =
              scores.reduce((sum: number, s: number) => sum + (s - avg) ** 2, 0) /
              scores.length;
            const stddev = Math.sqrt(variance);
            dimensionStats[dimId] = { avg, stddev };
          }
        }

        legMetrics[leg.id] = {
          id: leg.id,
          name: leg.name,
          runCount: runsInLeg.length,
          passRate: Number(passRate.toFixed(3)),
          avgScore: Number(avgScore.toFixed(3)),
          avgLatencyMs: null, // Could compute from run timestamps
          dimensionMetrics: dimensionStats,
        };
      }
    }

    // Compute deltas (baseline vs others)
    const baselineId = baselineLegs || experiment.legs[0]?.id;
    const baselineMetrics = baselineId ? legMetrics[baselineId] : undefined;
    const deltas = [];

    if (baselineMetrics) {
      for (const leg of experiment.legs) {
        if (leg.id === baselineId) continue;

        const legMetric = legMetrics[leg.id];
        if (!legMetric) continue;

        const passRateDelta =
          baselineMetrics.passRate !== null && legMetric.passRate !== null
            ? Number((legMetric.passRate - baselineMetrics.passRate).toFixed(3))
            : null;

        const scoreDelta =
          baselineMetrics.avgScore !== null && legMetric.avgScore !== null
            ? Number((legMetric.avgScore - baselineMetrics.avgScore).toFixed(3))
            : null;

        // Simple significance heuristic: |delta| > threshold
        let significance = 'low';
        if (
          (passRateDelta !== null && Math.abs(passRateDelta) > 0.05) ||
          (scoreDelta !== null && Math.abs(scoreDelta) > 0.5)
        ) {
          significance = 'high';
        }

        deltas.push({
          baselineLeg: baselineId,
          baselineLegName: baselineMetrics.name,
          comparisonLeg: leg.id,
          comparisonLegName: leg.name,
          passRateDelta,
          scoreDelta,
          significance,
        });
      }
    }

    return res.json({
      experiment: {
        id: experiment.id,
        name: experiment.name,
        scenarioId: experiment.scenarioId,
        status: experiment.status,
      },
      legs: Object.values(legMetrics),
      deltas,
    });
  } catch (error) {
    console.error('GET /api/experiments/:id/comparison error:', error);
    return res.status(500).json({ error: 'Failed to compute comparison' });
  }
});
