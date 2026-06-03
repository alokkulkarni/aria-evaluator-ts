// src/api/routes/reports.ts
import { Router } from 'express';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { appPaths } from '../../runtime/paths.js';
import { prisma } from '../../db/client.js';

export const reportsRouter = Router();

const REPORTS_DIR = appPaths.reportsDir;

reportsRouter.get('/', async (_req, res) => {
  try {
    if (!existsSync(REPORTS_DIR)) return res.json({ reports: [] });

    const files = readdirSync(REPORTS_DIR)
      .filter((f) => f.endsWith('.html') || f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .map((f) => {
        const stat = statSync(join(REPORTS_DIR, f));
        return { filename: f, size: stat.size, modifiedAt: stat.mtime.toISOString() };
      });

    // Fetch all report DB records (htmlPath stores canonical path like "reports/report_XXX.html")
    const dbReports = await prisma.report.findMany({
      include: { run: { select: { id: true, scenarioName: true, status: true, startedAt: true } } },
    });
    // Key by just the filename portion for easy lookup
    const dbMap = new Map(dbReports.map((r) => [basename(r.htmlPath), r]));

    const reports = files.map((f) => {
      const dbRec = f.filename.endsWith('.html') ? dbMap.get(f.filename) : undefined;
      return {
        ...f,
        runId: dbRec?.run?.id ?? null,
        runScenarioName: dbRec?.run?.scenarioName ?? null,
        runStatus: dbRec?.run?.status ?? null,
        runStartedAt: dbRec?.run?.startedAt?.toISOString() ?? null,
      };
    });

    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
