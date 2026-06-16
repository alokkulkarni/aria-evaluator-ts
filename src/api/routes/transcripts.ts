// src/api/routes/transcripts.ts
import { Router } from 'express';
import { basename } from 'node:path';
import { prisma } from '../../db/client.js';
import { getObjectStore } from '../../runtime/object-store.js';

export const transcriptsRouter = Router();

// DB-driven listing (no filesystem scan) + object-store serving, so any autoscaled
// instance lists and serves transcripts produced by another instance. Phase 4 of
// the multi-tenant migration. See docs/MULTI_TENANT_SPEC.md.
transcriptsRouter.get('/', async (_req, res) => {
  try {
    const rows = await prisma.transcriptArtifact.findMany({
      include: { run: { select: { id: true, scenarioName: true, status: true, startedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const transcripts = rows.map((t) => ({
      filename: basename(t.ref),
      size: 0,
      modifiedAt: (t.startedAt ?? t.createdAt).toISOString(),
      runId: t.run?.id ?? null,
      runScenarioName: t.run?.scenarioName ?? t.scenarioName,
      runStatus: t.run?.status ?? null,
      runStartedAt: t.run?.startedAt?.toISOString() ?? null,
    }));
    res.json({ transcripts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

transcriptsRouter.get('/:filename', async (req, res) => {
  const filename = req.params['filename']!;
  if (!filename.endsWith('.json') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  try {
    // Serve from the object store so any instance can serve a transcript another
    // instance produced (S3 in prod, local file otherwise).
    const buf = await getObjectStore().get(`transcripts/${filename}`);
    if (!buf) return res.status(404).json({ error: 'Not found' });
    res.type('application/json').send(buf);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
