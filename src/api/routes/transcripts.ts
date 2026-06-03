// src/api/routes/transcripts.ts
import { Router } from 'express';
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { appPaths } from '../../runtime/paths.js';
import { prisma } from '../../db/client.js';

export const transcriptsRouter = Router();

const TRANSCRIPTS_DIR = appPaths.transcriptsDir;

transcriptsRouter.get('/', async (_req, res) => {
  try {
    if (!existsSync(TRANSCRIPTS_DIR)) return res.json({ transcripts: [] });

    const files = readdirSync(TRANSCRIPTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a));

    // Extract runId from each transcript file (the `id` field IS the runId)
    const fileInfos = files.map((f) => {
      const filePath = join(TRANSCRIPTS_DIR, f);
      const stat = statSync(filePath);
      let runId: string | undefined;
      try {
        const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as { id?: string };
        runId = raw.id;
      } catch { /* skip unreadable files */ }
      return { filename: f, size: stat.size, modifiedAt: stat.mtime.toISOString(), runId };
    });

    // Batch-fetch run info from DB for all known runIds
    const runIds = fileInfos.map((f) => f.runId).filter(Boolean) as string[];
    const runs = runIds.length > 0
      ? await prisma.run.findMany({
          where: { id: { in: runIds } },
          select: { id: true, scenarioName: true, status: true, startedAt: true },
        })
      : [];
    const runMap = new Map(runs.map((r) => [r.id, r]));

    const transcripts = fileInfos.map(({ runId, ...f }) => {
      const run = runId ? runMap.get(runId) : undefined;
      return {
        ...f,
        runId: runId ?? null,
        runScenarioName: run?.scenarioName ?? null,
        runStatus: run?.status ?? null,
        runStartedAt: run?.startedAt?.toISOString() ?? null,
      };
    });

    res.json({ transcripts });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

transcriptsRouter.get('/:filename', (req, res) => {
  const filename = req.params['filename']!;
  if (!filename.endsWith('.json') || filename.includes('/') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = join(TRANSCRIPTS_DIR, filename);
  if (!existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  const content = JSON.parse(readFileSync(filePath, 'utf-8'));
  res.json(content);
});
