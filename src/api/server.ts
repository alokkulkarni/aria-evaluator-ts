// src/api/server.ts
// Express REST API + SSE for live run progress

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';

import { initDb } from '../db/client.js';
import { startRunJobWorker } from '../jobs/run-jobs.js';
import { appPaths, ensureManagedStateDirs, getStateLayoutWarnings } from '../runtime/paths.js';
import { attachAuthContext, authRouter, requireAuth } from './auth.js';
import { scenariosRouter } from './routes/scenarios.js';
import { runsRouter } from './routes/runs.js';
import { reviewsRouter } from './routes/reviews.js';
import { transcriptsRouter } from './routes/transcripts.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { openapiRouter } from './routes/openapi.js';
import { regressionRouter } from './routes/regression.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env['API_PORT'] ?? '3001', 10);
const DIST_DIR = join(__dirname, '../../dist/ui');
const PUBLIC_DIR = join(__dirname, '../../public');
const configuredCorsOrigins = (process.env['CORS_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const isDevelopment = process.env['NODE_ENV'] !== 'production';

export const app = express();

if (process.env['TRUST_PROXY']?.trim() === 'true') {
  app.set('trust proxy', 1);
}

// Serialize BigInt as number (Prisma uses BigInt for timestampMs)
app.set('json replacer', (_key: string, value: unknown) =>
  typeof value === 'bigint' ? Number(value) : value,
);

function isLocalhostOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isTrustedOrigin(origin: string, req?: Request): boolean {
  const normalized = origin.trim();
  if (!normalized) return false;
  if (configuredCorsOrigins.includes(normalized)) return true;
  if (isDevelopment && isLocalhostOrigin(normalized)) return true;
  if (!req) return false;
  const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol;
  const requestOrigin = `${protocol}://${req.get('host')}`;
  return normalized === requestOrigin;
}

function enforceTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }

  const origin = req.get('origin');
  if (origin) {
    if (!isTrustedOrigin(origin, req)) {
      res.status(403).json({ error: 'Untrusted origin' });
      return;
    }
    next();
    return;
  }

  const referer = req.get('referer');
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!isTrustedOrigin(refererOrigin, req)) {
        res.status(403).json({ error: 'Untrusted origin' });
        return;
      }
      next();
      return;
    } catch {
      res.status(403).json({ error: 'Invalid referer' });
      return;
    }
  }

  res.status(403).json({ error: 'Missing origin' });
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) {
      cb(null, true);
      return;
    }
    cb(null, isTrustedOrigin(origin));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// ── API routes ─────────────────────────────────────────────────────────────────
app.use('/api', attachAuthContext);
app.use('/api/auth', authRouter);
app.use('/api', enforceTrustedOrigin);
app.use('/api', requireAuth);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api', regressionRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/openapi', openapiRouter);

// ── Static file serving ────────────────────────────────────────────────────────
app.use('/reports', attachAuthContext, requireAuth, express.static(appPaths.reportsDir));
app.use('/transcripts', attachAuthContext, requireAuth, express.static(appPaths.transcriptsDir));
app.use('/audio', attachAuthContext, requireAuth, express.static(appPaths.audioDir));
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
    await startRunJobWorker();

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
