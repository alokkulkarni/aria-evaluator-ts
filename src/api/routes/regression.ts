import express, { type Request, type Response } from 'express';
import { prisma } from '../../db/client.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth, requireAdminAuth } from '../auth.js';
import {
  computeScenarioMetrics,
  detectRegression,
  type RunMetricsInput,
} from '../../lib/metrics.js';

export const regressionRouter = express.Router();

// ─── Baseline Management ──────────────────────────────────────────────────────

/**
 * POST /api/baselines
 * Create a new baseline snapshot for a scenario.
 * Requires admin role.
 * Minimum 10 runs required.
 */
regressionRouter.post(
  '/baselines',
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { scenarioId, name, notes, judgeModel, judgeVersion, thresholdOverridesJson, dimensionIds } =
        req.body;
      const auth = getRequestAuth(req);
      const userId = auth?.userId;

      // Validate required fields
      if (!scenarioId || !name || !judgeModel || judgeVersion === undefined) {
        return res
          .status(400)
          .json({
            error:
              'Missing required fields: scenarioId, name, judgeModel, judgeVersion',
          });
      }

      if (typeof judgeVersion !== 'number' || judgeVersion < 0) {
        return res.status(400).json({ error: 'judgeVersion must be a non-negative integer' });
      }

      // Validate thresholdOverridesJson if provided
      if (thresholdOverridesJson) {
        try {
          const parsed = JSON.parse(thresholdOverridesJson);
          if (
            typeof parsed !== 'object' ||
            (parsed.passRateDrop !== undefined &&
              typeof parsed.passRateDrop !== 'number') ||
            (parsed.scoreDrop !== undefined && typeof parsed.scoreDrop !== 'number') ||
            (parsed.latencyIncrease !== undefined &&
              typeof parsed.latencyIncrease !== 'number')
          ) {
            return res.status(400).json({ error: 'Invalid thresholdOverridesJson format' });
          }
        } catch {
          return res.status(400).json({ error: 'thresholdOverridesJson must be valid JSON' });
        }
      }

      // Verify scenario exists
      const scenario = await prisma.scenario.findUnique({
        where: { id: scenarioId },
      });
      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }

      // Fetch runs for this scenario
      const runs = await prisma.run.findMany({
        where: {
          scenarioId,
          evalResult: { is: { judgeModel } },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          evalResult: {
            select: {
              id: true,
              passed: true,
              overallScore: true,
              createdAt: true,
              dimensionScores: true,
            },
          },
        },
      });

      // Require at least 10 runs with eval results
      const runsWithResults = runs.filter((r) => r.evalResult);
      if (runsWithResults.length < 10) {
        return res.status(400).json({
          error: `Insufficient runs to create baseline: ${runsWithResults.length} < 10 required`,
        });
      }

      // Extract or validate dimension IDs
      let finalDimensionIds: string[] = [];
      if (dimensionIds && Array.isArray(dimensionIds)) {
        finalDimensionIds = dimensionIds;
      } else {
        // Infer from eval results
        const dimSet = new Set<string>();
        for (const run of runsWithResults) {
          if (run.evalResult?.dimensionScores) {
            try {
              const dims = JSON.parse(run.evalResult.dimensionScores);
              Object.keys(dims).forEach((d) => dimSet.add(d));
            } catch {
              // Skip malformed
            }
          }
        }
        finalDimensionIds = Array.from(dimSet).sort();
      }

      // Prepare metrics input
      const metricsInput: RunMetricsInput[] = runsWithResults.map((r) => ({
        run: r,
        evalResults: r.evalResult
          ? [
              {
                score: r.evalResult.overallScore,
                passed: r.evalResult.passed,
                createdAt: r.evalResult.createdAt,
                dimensionScoresJson: r.evalResult.dimensionScores,
              },
            ]
          : [],
      }));

      // Compute metrics
      const metrics = computeScenarioMetrics(metricsInput, finalDimensionIds);

      // Create baseline record
      const baseline = await prisma.baseline.create({
        data: {
          name,
          scenarioId,
          totalRuns: metrics.totalRuns,
          passRate: metrics.passRate,
          avgScore: metrics.avgScore,
          avgLatencyMs: metrics.avgLatencyMs,
          dimensionIdsJson: JSON.stringify(finalDimensionIds),
          dimensionMetricsJson: JSON.stringify(metrics.dimensionMetrics),
          judgeModel,
          judgeVersion,
          thresholdOverridesJson,
          createdBy: userId,
          notes,
        },
        include: { user: true },
      });

      // Audit log
      await recordAuditEventSafe(req, 'baseline.create', baseline.id, {
        scenarioId,
        baselineName: name,
        totalRuns: metrics.totalRuns,
        judgeModel,
      });

      return res.status(201).json(baseline);
    } catch (error) {
      console.error('Error creating baseline:', error);
      return res.status(500).json({ error: 'Failed to create baseline' });
    }
  }
);

/**
 * GET /api/baselines
 * List all baselines (optionally filtered by scenarioId, judgeModel).
 * Requires auth (enforced globally).
 */
regressionRouter.get('/baselines', async (req: Request, res: Response) => {
  try {
    const { scenarioId, judgeModel } = req.query;

    const where: any = {};
    if (scenarioId && typeof scenarioId === 'string') {
      where.scenarioId = scenarioId;
    }
    if (judgeModel && typeof judgeModel === 'string') {
      where.judgeModel = judgeModel;
    }

    const baselines = await prisma.baseline.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    });

    return res.json(baselines);
  } catch (error) {
    console.error('Error listing baselines:', error);
    return res.status(500).json({ error: 'Failed to list baselines' });
  }
});

/**
 * GET /api/baselines/:id
 * Get a single baseline by ID.
 * Requires auth (enforced globally).
 */
regressionRouter.get('/baselines/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const idStr = Array.isArray(id) ? id[0] : id;

    const baseline = await prisma.baseline.findUnique({
      where: { id: idStr },
      include: { user: { select: { username: true } } },
    });

    if (!baseline) {
      return res.status(404).json({ error: 'Baseline not found' });
    }

    return res.json(baseline);
  } catch (error) {
    console.error('Error fetching baseline:', error);
    return res.status(500).json({ error: 'Failed to fetch baseline' });
  }
});

/**
 * DELETE /api/baselines/:id
 * Delete a baseline (admin only).
 * Requires admin role.
 */
regressionRouter.delete(
  '/baselines/:id',
  requireAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idStr = Array.isArray(id) ? id[0] : id;
      const auth = getRequestAuth(req);
      const userId = auth?.userId;

      const baseline = await prisma.baseline.findUnique({
        where: { id: idStr },
      });

      if (!baseline) {
        return res.status(404).json({ error: 'Baseline not found' });
      }

      await prisma.baseline.delete({
        where: { id: idStr },
      });

      // Audit log
      await recordAuditEventSafe(req, 'baseline.delete', idStr, {
        scenarioId: baseline.scenarioId,
        baselineName: baseline.name,
      });

      return res.json({ message: 'Baseline deleted' });
    } catch (error) {
      console.error('Error deleting baseline:', error);
      return res.status(500).json({ error: 'Failed to delete baseline' });
    }
  }
);

// ─── Regression Reporting ─────────────────────────────────────────────────────

/**
 * GET /api/regression/status
 * Compute regression report by comparing recent runs to baseline.
 * Query params:
 *   - scenarioId (required): scenario to analyze
 *   - judgeModel (optional): if provided, uses latest baseline for this judge model
 *   - sinceRunCount (optional): include last N runs
 */
regressionRouter.get('/regression/status', async (req: Request, res: Response) => {
  try {
    const { scenarioId: scenarioIdParam, judgeModel: judgeModelParam, sinceRunCount: sinceRunCountParam } = req.query;

    // Validate and extract query parameters
    const scenarioId = Array.isArray(scenarioIdParam) ? scenarioIdParam[0] : scenarioIdParam;
    const judgeModel = Array.isArray(judgeModelParam) ? judgeModelParam[0] : judgeModelParam;
    const sinceRunCountStr = Array.isArray(sinceRunCountParam) ? sinceRunCountParam[0] : sinceRunCountParam;

    if (!scenarioId || typeof scenarioId !== 'string') {
      return res.status(400).json({ error: 'scenarioId is required' });
    }

    // Verify scenario exists
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
    });
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    // Find latest baseline
    const baselineWhere: any = { scenarioId };
    if (judgeModel && typeof judgeModel === 'string') {
      baselineWhere.judgeModel = judgeModel;
    }

    const baseline = await prisma.baseline.findFirst({
      where: baselineWhere,
      orderBy: { createdAt: 'desc' },
    });

    if (!baseline) {
      return res.status(404).json({ error: 'No baseline found for this scenario' });
    }

    // Determine take count for recent runs
    let takeCount: number | undefined;
    if (sinceRunCountStr && typeof sinceRunCountStr === 'string') {
      const count = parseInt(sinceRunCountStr, 10);
      if (!isNaN(count) && count > 0) {
        takeCount = count;
      }
    }

    // Fetch recent runs (after baseline creation)
    const runs = await prisma.run.findMany({
      where: {
        scenarioId,
        createdAt: { gte: baseline.createdAt },
      },
      orderBy: { createdAt: 'desc' },
      take: takeCount,
      include: {
        evalResult: {
          select: {
            id: true,
            passed: true,
            overallScore: true,
            createdAt: true,
            dimensionScores: true,
          },
        },
      },
    });

    // Filter to runs with results
    const runsWithResults = runs.filter((r) => r.evalResult);

    if (runsWithResults.length === 0) {
      return res.status(200).json({
        message: 'No recent runs found',
        recentRunCount: 0,
        regression: null,
      });
    }

    // Parse baseline dimension IDs
    let baselineDimIds: string[] = [];
    try {
      baselineDimIds = JSON.parse(baseline.dimensionIdsJson);
    } catch {
      return res.status(500).json({ error: 'Malformed baseline dimensionIdsJson' });
    }

    // Prepare metrics input
    const metricsInput: RunMetricsInput[] = runsWithResults.map((r) => ({
      run: r,
      evalResults: r.evalResult
        ? [
            {
              score: r.evalResult.overallScore,
              passed: r.evalResult.passed,
              createdAt: r.evalResult.createdAt,
              dimensionScoresJson: r.evalResult.dimensionScores,
            },
          ]
        : [],
    }));

    // Compute recent metrics
    const recentMetrics = computeScenarioMetrics(metricsInput, baselineDimIds);

    // Detect regression
    const regressionReport = detectRegression(baseline, recentMetrics);

    return res.json({
      baseline: {
        id: baseline.id,
        name: baseline.name,
        createdAt: baseline.createdAt,
        totalRuns: baseline.totalRuns,
        passRate: baseline.passRate,
        avgScore: baseline.avgScore,
        avgLatencyMs: baseline.avgLatencyMs,
      },
      regression: regressionReport,
      recentRunCount: runsWithResults.length,
      dateRange: {
        from: runsWithResults[runsWithResults.length - 1]?.createdAt,
        to: runsWithResults[0]?.createdAt,
      },
    });
  } catch (error) {
    console.error('Error computing regression status:', error);
    return res.status(500).json({ error: 'Failed to compute regression status' });
  }
});
