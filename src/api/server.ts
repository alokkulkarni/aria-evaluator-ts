// src/api/server.ts
// Express REST API + SSE for live run progress

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { initDb } from '../db/client.js';
import { appPaths, ensureManagedStateDirs, getStateLayoutWarnings } from '../runtime/paths.js';
import { scenariosRouter } from './routes/scenarios.js';
import { runsRouter } from './routes/runs.js';
import { transcriptsRouter } from './routes/transcripts.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { openapiRouter } from './routes/openapi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env['API_PORT'] ?? '3001', 10);
const DIST_DIR = join(__dirname, '../../dist/ui');
const PUBLIC_DIR = join(__dirname, '../../public');

export const app = express();

// Serialize BigInt as number (Prisma uses BigInt for timestampMs)
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value,
);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/openapi', openapiRouter);

// ── Static file serving ────────────────────────────────────────────────────────
app.use('/reports',     express.static(appPaths.reportsDir));
app.use('/transcripts', express.static(appPaths.transcriptsDir));
app.use('/audio',       express.static(appPaths.audioDir));
app.use(express.static(PUBLIC_DIR));
if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get('*', (_req, res) => {
    res.sendFile(join(DIST_DIR, 'index.html'));
  });
}

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ── Start ──────────────────────────────────────────────────────────────────────
if (process.env['NODE_ENV'] !== 'test') {
  void (async () => {
    ensureManagedStateDirs();
    for (const warning of getStateLayoutWarnings()) {
      console.warn(`⚠ ${warning}`);
    }
    await initDb();

    const server = createServer(app);
    server.listen(PORT, () => {
      console.log(`\n🚀 ARIA Evaluator API running at http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   UI:     http://localhost:${PORT}`);
      console.log(`   CCP:    http://localhost:${PORT}/evaluator-ccp.html\n`);
    });
  })().catch((err: unknown) => {
    console.error(`Failed to start API: ${(err as Error).message}`);
    process.exit(1);
  });
}
