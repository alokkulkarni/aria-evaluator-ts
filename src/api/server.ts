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
import { attachAuthContext, authRouter, ssoRouter, requireAuth, ensureDefaultAdminAccount } from './auth.js';
import { scenariosRouter } from './routes/scenarios.js';
import { runsRouter } from './routes/runs.js';
import { reviewsRouter } from './routes/reviews.js';
import { transcriptsRouter } from './routes/transcripts.js';
import { reportsRouter } from './routes/reports.js';
import { settingsRouter } from './routes/settings.js';
import { openapiRouter } from './routes/openapi.js';
import { regressionRouter } from './routes/regression.js';
import { experimentsRouter } from './routes/experiments.js';
import { observabilityRouter } from './routes/observability.js';
import { schedulesRouter } from './routes/schedules.js';
import { workspaceRouter } from './routes/workspace.js';
import { usageRouter } from './routes/usage.js';
import { startScheduleExecutor, stopScheduleExecutor } from '../jobs/schedule-executor.js';

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

// ── Security headers ──────────────────────────────────────────────────────────
app.use((_req, res, next) => {
  const isReportAsset = _req.path === '/reports' || _req.path.startsWith('/reports/');

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', isReportAsset ? 'SAMEORIGIN' : 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (process.env['NODE_ENV'] === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  }
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      `frame-ancestors ${isReportAsset ? "'self'" : "'none'"}`,
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  );
  next();
});

// ── Request body sanitization — strip sensitive fields from logs ───────────────
const SENSITIVE_BODY_FIELDS = new Set([
  'password', 'newPassword', 'currentPassword', 'confirmPassword',
  'secret', 'token', 'bootstrapToken', 'accessToken', 'refreshToken',
  'apiKey', 'privateKey',
]);

function sanitizeBodyForLogging(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    result[key] = SENSITIVE_BODY_FIELDS.has(key) ? '[redacted]' : value;
  }
  return result;
}

// Override console.log/warn/error in production to prevent accidental password leaks
if (process.env['NODE_ENV'] === 'production') {
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const sanitized = args.map((arg) =>
      typeof arg === 'string' ? arg.replace(/password['":\s]*['"]?[^'"}\s,]*/gi, 'password:[redacted]') : arg
    );
    originalError(...sanitized);
  };
}

// ── API routes ─────────────────────────────────────────────────────────────────
// SSO ingestion route — must be mounted BEFORE attachAuthContext so the
// unauthenticated redirect from the website hits here first.
// Path matches what control-plane emits: {instanceUrl}/auth/sso?token=...
app.use('/auth/sso', ssoRouter);
app.use('/api', attachAuthContext);
app.use('/api/auth', authRouter);
app.use('/api', enforceTrustedOrigin);
app.use('/api', requireAuth);
app.use('/api/scenarios', scenariosRouter);
app.use('/api/runs', runsRouter);
app.use('/api/schedules', schedulesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api', observabilityRouter);
app.use('/api', regressionRouter);
app.use('/api/experiments', experimentsRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/usage', usageRouter);
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
    await ensureDefaultAdminAccount();
    await startRunJobWorker();
    await startScheduleExecutor();

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
