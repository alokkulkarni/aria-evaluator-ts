// src/db/client.ts
import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId, hasTenantContext, isSystemContext } from '../lib/tenant-context.js';

const parsedBusyTimeoutMs = Number.parseInt(process.env['SQLITE_BUSY_TIMEOUT_MS'] ?? '5000', 10);
const busyTimeoutMs = Math.max(0, Number.isNaN(parsedBusyTimeoutMs) ? 5000 : parsedBusyTimeoutMs);

const logLevel: ('warn' | 'error')[] =
  process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'];

// ── Tenant scoping guard ─────────────────────────────────────────────────────
// Models whose rows belong to a single tenant. The guard is a transparent Prisma
// query extension. TENANT_SCOPING_MODE:
//   off  (default) — disabled, zero overhead. No behavior change.
//   log            — warn when a tenant-scoped model is queried with no tenant
//                    context bound (audit which call sites are unscoped).
//   enforce        — when a tenant is bound to the request (AsyncLocalStorage),
//                    auto-inject `where: { tenantId }` on filterable reads/writes
//                    and `data: { tenantId }` on creates. System/job/unauth
//                    contexts (no bound tenant) are left UNRESTRICTED so trusted
//                    background work still sees everything.
//
// findUnique/upsert/update/delete by a UNIQUE where can't take an extra tenant
// filter, so those are covered by per-route id guards (defense in depth).
// See docs/MULTI_TENANT_SPEC.md.
const TENANT_SCOPED_MODELS = new Set<string>([
  'User', 'AuthSession', 'AuditLog', 'Scenario', 'Run',
  'Baseline', 'Experiment', 'Schedule', 'CalibrationDataset',
]);
// Run-children with no tenantId column of their own — they belong to a Run via
// the `run` relation, so reads are scoped through it (`where: { run: { tenantId } }`).
// Without this, dashboard aggregates over these (latency/cost from RunTelemetry,
// dimension scores from EvalResult, etc.) leak across tenants even though the Run
// list itself is correctly isolated. Writes/unique-by-runId ops are left alone —
// the parent Run is already tenant-scoped.
// Value is the relation PATH from the child to the tenant-bearing Run. Most are a
// direct `run` relation; Review reaches it via evalResult → run.
const RUN_CHILD_MODELS = new Map<string, string[]>([
  ['EvalResult', ['run']], ['RunTelemetry', ['run']], ['Report', ['run']],
  ['RunEvent', ['run']], ['Turn', ['run']], ['SecurityAttack', ['run']],
  ['Job', ['run']], ['ExperimentRun', ['run']], ['ScheduleRun', ['run']],
  ['TranscriptArtifact', ['run']], ['Review', ['evalResult', 'run']],
  ['ScenarioEval', ['run']],
]);
const TENANT_SCOPING_MODE = process.env['TENANT_SCOPING_MODE'] ?? 'off';

// Operations whose `where` accepts arbitrary filters (safe to inject tenantId).
const FILTERABLE_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
  'updateMany', 'deleteMany',
]);

// Read ops where a relation filter (`run: { tenantId }`) is valid Prisma — used to
// scope run-children. updateMany/deleteMany are excluded (Prisma rejects relation
// filters there); those stay keyed by runId and ride the parent Run's scope.
const CHILD_READ_OPS = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy',
]);

function scopeChildToTenant(path: string[], operation: string, args: any, tenantId: string | null): any {
  if (!CHILD_READ_OPS.has(operation)) return args;
  // Deep-merge tenantId into the relation path (e.g. ['evalResult','run'] →
  // where.evalResult.run.tenantId), copying each level so existing filters on the
  // same relations (like { run: { NOT: { status: 'deleted' } } }) are preserved.
  const where: Record<string, any> = { ...(args?.where ?? {}) };
  let node = where;
  for (let i = 0; i < path.length - 1; i++) {
    node[path[i]!] = { ...(node[path[i]!] ?? {}) };
    node = node[path[i]!];
  }
  const leaf = path[path.length - 1]!;
  node[leaf] = { ...(node[leaf] ?? {}), tenantId };
  return { ...args, where };
}

function scopeArgsToTenant(operation: string, args: any, tenantId: string | null): any {
  if (FILTERABLE_OPS.has(operation)) {
    return { ...args, where: { ...(args?.where ?? {}), tenantId } };
  }
  if (operation === 'create') {
    return { ...args, data: { ...(args?.data ?? {}), tenantId } };
  }
  if (operation === 'createMany') {
    const rows = args?.data;
    return { ...args, data: Array.isArray(rows) ? rows.map((r: any) => ({ ...r, tenantId })) : { ...rows, tenantId } };
  }
  // Unique-where ops (findUnique/upsert/update/delete) — left to per-route guards.
  return args;
}

const basePrisma = new PrismaClient({ log: logLevel });

// The cast keeps the exported type as PrismaClient so the existing call sites are
// unaffected; the extension only filters/stamps tenant-scoped queries.
export const prisma: PrismaClient =
  TENANT_SCOPING_MODE === 'off'
    ? basePrisma
    : (basePrisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              const childRelation = model ? RUN_CHILD_MODELS.get(model) : undefined;
              if (!model || (!TENANT_SCOPED_MODELS.has(model) && !childRelation)) return query(args);
              if (TENANT_SCOPING_MODE === 'log') {
                if (!hasTenantContext()) {
                  console.warn(`[tenant-scope] ${model}.${operation} ran without a tenant context`);
                }
                return query(args);
              }
              // Unrestricted only for the explicit system context or genuinely
              // unbound work (job claim loop, startup, services). An explicit
              // runWithTenant scope is always applied — even to a null tenant,
              // which scopes to null-tenant rows (a misconfigured tenant user
              // sees only system data, never another tenant's).
              if (isSystemContext() || !hasTenantContext()) return query(args);
              const tenantId = getCurrentTenantId();
              const scopedArgs = childRelation
                ? scopeChildToTenant(childRelation, operation, args, tenantId)
                : scopeArgsToTenant(operation, args, tenantId);
              return query(scopedArgs);
            },
          },
        },
      }) as unknown as PrismaClient);

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
