// src/db/client.ts
import { PrismaClient } from '@prisma/client';
import { hasTenantContext } from '../lib/tenant-context.js';

const parsedBusyTimeoutMs = Number.parseInt(process.env['SQLITE_BUSY_TIMEOUT_MS'] ?? '5000', 10);
const busyTimeoutMs = Math.max(0, Number.isNaN(parsedBusyTimeoutMs) ? 5000 : parsedBusyTimeoutMs);

const logLevel: ('warn' | 'error')[] =
  process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'];

// ── Tenant scoping guard (Phase 0 — dormant by default) ──────────────────────
// Models whose rows belong to a single tenant. In Phase 3 the guard auto-injects
// `where/data: { tenantId }` for these; for now it only OBSERVES, so we can audit
// every call site that touches a tenant-scoped model without a tenant context.
//
// TENANT_SCOPING_MODE:
//   off  (default) — guard disabled, zero overhead. No behavior change.
//   log            — warn when a tenant-scoped model is queried with no tenant
//                    context bound (use during the Phase 3 audit).
// Enforcement ("enforce") lands in Phase 3. See docs/MULTI_TENANT_SPEC.md.
const TENANT_SCOPED_MODELS = new Set<string>([
  'User', 'AuthSession', 'AuditLog', 'Scenario', 'Run',
  'Baseline', 'Experiment', 'Schedule', 'CalibrationDataset',
]);
const TENANT_SCOPING_MODE = process.env['TENANT_SCOPING_MODE'] ?? 'off';

const basePrisma = new PrismaClient({ log: logLevel });

// When TENANT_SCOPING_MODE=log, wrap the client in a transparent query extension
// that warns on tenant-scoped access with no bound tenant. The cast keeps the
// exported type as PrismaClient (the extension only observes — it never alters
// query behavior), so existing call sites are unaffected.
export const prisma: PrismaClient =
  TENANT_SCOPING_MODE === 'log'
    ? (basePrisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              if (model && TENANT_SCOPED_MODELS.has(model) && !hasTenantContext()) {
                console.warn(`[tenant-scope] ${model}.${operation} ran without a tenant context`);
              }
              return query(args);
            },
          },
        },
      }) as unknown as PrismaClient)
    : basePrisma;

// Read-replica client: uses DATABASE_READ_REPLICA_URL when set (e.g. RDS read replica),
// otherwise falls back to the primary connection so local/SQLite deployments need no change.
const replicaUrl = process.env['DATABASE_READ_REPLICA_URL'];
export const prismaRead: PrismaClient = replicaUrl
  ? new PrismaClient({
      log: logLevel,
      datasources: { db: { url: replicaUrl } },
    })
  : basePrisma;

/** Returns the appropriate read client (replica if configured, primary otherwise). */
export function getReadClient(): PrismaClient {
  return prismaRead;
}

let initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await prisma.$connect();
    // SQLite-specific pragmas. `PRAGMA` is a syntax error on PostgreSQL, so only
    // run these when pointed at a SQLite file: URL (e.g. a one-off local fallback).
    if ((process.env['DATABASE_URL'] ?? '').startsWith('file:')) {
      await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
      await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
    }

    if (replicaUrl) {
      await prismaRead.$connect();
      console.info('[DB] Read replica connected:', replicaUrl.replace(/:[^@]*@/, ':***@'));
    }
  })();

  return initPromise;
}
