// src/api/routes/reports.ts
import { Router } from 'express';
import { basename } from 'node:path';
import { prisma } from '../../db/client.js';
import { getCurrentTenantId } from '../../lib/tenant-context.js';

export const reportsRouter = Router();

// DB-driven listing — no local-filesystem scan, so any autoscaled instance lists
// every report (the files themselves are served from the object store). This
// removes the reports listing's dependency on the whole-dir state sync. Phase 4
// of the multi-tenant migration. See docs/MULTI_TENANT_SPEC.md.
reportsRouter.get('/', async (_req, res) => {
  try {
    // Scope to the caller's tenant via the run relation (Report isn't an
    // auto-scoped model). Always-on, so it's correct regardless of enforce mode;
    // a null tenant (system/non-SSO) is unrestricted. Phase 3 hardening.
    const tenantId = getCurrentTenantId();
    const dbReports = await prisma.report.findMany({
      where: tenantId ? { run: { tenantId } } : {},
      include: { run: { select: { id: true, scenarioName: true, status: true, startedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const reports = dbReports.flatMap((r) => {
      const meta = {
        size: 0,
        modifiedAt: r.createdAt.toISOString(),
        runId: r.run?.id ?? null,
        runScenarioName: r.run?.scenarioName ?? null,
        runStatus: r.run?.status ?? null,
        runStartedAt: r.run?.startedAt?.toISOString() ?? null,
      };
      return [
        { filename: basename(r.htmlPath), ...meta },
        { filename: basename(r.jsonPath), ...meta },
      ];
    });

    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
