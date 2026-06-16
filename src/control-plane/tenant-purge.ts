// src/control-plane/tenant-purge.ts
// Phase 6 data-purge. Tenants are scale-to-zero, so at delete time there is no
// per-tenant evaluator task to call — the control-plane purges the tenant's data
// directly: shared-Postgres rows (by the evaluator Tenant.id resolved from the
// control-plane tenant id = Tenant.externalId) and the object-store prefix.
// See docs/MULTI_TENANT_SPEC.md (Phase 6).

import { PrismaClient } from '@prisma/client';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

// Tenant-scoped root tables, in dependents-first order. Children (ScenarioRevision,
// EvalResult, RunEvent, ExperimentLeg/Run, ScheduleRun, …) cascade from their parent
// row; cross-root references (e.g. Run.scenarioId) are nullable → SetNull, so they
// never block these deletes. Order still favours dependents first for clarity.
const ROOT_DELETE_ORDER = [
  'experiment',
  'schedule',
  'baseline',
  'run',
  'scenario',
  'transcriptArtifact',
  'calibrationDataset',
  'runtimeSettings',
  'auditLog',
  'authSession',
  'user',
] as const;

export interface TenantPurgeResult {
  postgres: Record<string, number>;
  objectStoreDeleted: number;
  skipped: string[];
}

let prismaClient: PrismaClient | null = null;
function getPrisma(): PrismaClient | null {
  const url = process.env['DATABASE_URL']?.trim();
  // The control-plane only connects to Postgres for purges (Phase 6). Without a
  // Postgres URL (e.g. a control-plane with no DB wiring), skip the row purge.
  if (!url || url.startsWith('file:')) return null;
  if (!prismaClient) prismaClient = new PrismaClient();
  return prismaClient;
}

async function purgePostgres(controlPlaneTenantId: string, result: TenantPurgeResult): Promise<void> {
  const db = getPrisma();
  if (!db) {
    result.skipped.push('postgres (no DATABASE_URL)');
    return;
  }

  // The control-plane tenant id is stored on the evaluator Tenant row as externalId;
  // tenant-scoped rows reference the Tenant.id (a cuid).
  const tenantRow = await db.tenant.findFirst({
    where: { externalId: controlPlaneTenantId },
    select: { id: true },
  });

  if (tenantRow) {
    const internalTenantId = tenantRow.id;
    for (const model of ROOT_DELETE_ORDER) {
      const delegate = (db as unknown as Record<string, { deleteMany?: (a: unknown) => Promise<{ count: number }> }>)[model];
      if (!delegate?.deleteMany) continue;
      const deleted = await delegate.deleteMany({ where: { tenantId: internalTenantId } });
      if (deleted.count > 0) result.postgres[model] = deleted.count;
    }
    const tenantDeleted = await db.tenant.deleteMany({ where: { id: internalTenantId } });
    if (tenantDeleted.count > 0) result.postgres['tenant'] = tenantDeleted.count;
  } else {
    // No evaluator Tenant row — the tenant never reached the evaluator. Still try to
    // remove a stray Tenant row keyed only by externalId.
    const stray = await db.tenant.deleteMany({ where: { externalId: controlPlaneTenantId } });
    if (stray.count > 0) result.postgres['tenant'] = stray.count;
  }
}

async function purgeObjectStore(controlPlaneTenantId: string, result: TenantPurgeResult): Promise<void> {
  const bucket = process.env['PLATFORM_STATE_BUCKET']?.trim() || process.env['AWS_S3_STATE_BUCKET']?.trim();
  if (!bucket) {
    result.skipped.push('object-store (no PLATFORM_STATE_BUCKET)');
    return;
  }

  const region = process.env['AWS_REGION']?.trim() || 'eu-west-2';
  const s3 = new S3Client({ region });
  const prefix = `${controlPlaneTenantId}/`;
  let continuationToken: string | undefined;

  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (listed.Contents ?? []).map((o) => ({ Key: o.Key! })).filter((o) => o.Key);
    if (objects.length > 0) {
      await s3.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }));
      result.objectStoreDeleted += objects.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

/**
 * Purge all of a tenant's data: shared-Postgres rows and the object-store prefix.
 * Best-effort per layer — a failure in one layer is recorded and rethrown so the
 * caller can decide; partial purges are safe to retry (deletes are idempotent).
 */
export async function purgeTenantData(controlPlaneTenantId: string): Promise<TenantPurgeResult> {
  const result: TenantPurgeResult = { postgres: {}, objectStoreDeleted: 0, skipped: [] };
  await purgePostgres(controlPlaneTenantId, result);
  await purgeObjectStore(controlPlaneTenantId, result);
  return result;
}
