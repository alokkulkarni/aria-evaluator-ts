// src/conversation/scenario-store.ts
// DB-authoritative scenario access. Scenarios used to live as YAML files on disk
// (shared via an S3 sync); they now live in the Scenario table (per-doc yamlContent
// + sourceRef), shared across a tenant's tasks via Postgres and isolated by tenant.
//
// Visibility model:
//   - System/admin (no SSO) — sees the GLOBAL library (tenantId = null), the set
//     seeded from the bundled YAML at startup. Preserves the prior admin view.
//   - Tenant (SSO) user      — sees GLOBAL templates ∪ their OWN rows. When a tenant
//     edits a global scenario the guard writes a tenant-owned COPY (copy-on-write);
//     that copy shadows the global (same stable key / sourceRef), so we de-dupe
//     preferring the caller's own row.
//
// Reads here intentionally run in runAsSystem with an explicit visibility `where`,
// because the strict tenant guard can only express a single-tenant equality and
// cannot express "global ∪ own". See docs/MULTI_TENANT_SPEC.md (Phase 4).

import { existsSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import yaml from 'js-yaml';

import { prisma } from '../db/client.js';
import {
  getCurrentTenantId,
  hasTenantContext,
  isSystemContext,
  runAsSystem,
} from '../lib/tenant-context.js';
import type { Scenario } from '../types/scenario.js';
import { loadScenariosFromDir } from './scenario-loader.js';
import {
  deterministicScenarioId,
  makeScenarioKey,
  normalizeScenarioDoc,
  parseLifecycleStatus,
  type NormalizedScenarioDoc,
  type ScenarioLifecycleStatus,
} from './scenario-doc.js';

const SCENARIO_ROW_SELECT = {
  filePath: true,
  sourceRef: true,
  tenantId: true,
  name: true,
  channel: true,
  owner: true,
  lifecycleStatus: true,
  lastRevisionAt: true,
  yamlContent: true,
  _count: { select: { revisions: true } },
} as const;

interface ScenarioRow {
  filePath: string;
  sourceRef: string | null;
  tenantId: string | null;
  name: string;
  channel: string;
  owner: string | null;
  lifecycleStatus: string;
  lastRevisionAt: Date | null;
  yamlContent: string;
  _count: { revisions: number };
}

type UpsertResult = 'created' | 'updated' | 'unchanged';

/** Whether the current request runs as platform/system (no bound tenant). */
function callerIsSystem(): boolean {
  return isSystemContext() || !hasTenantContext();
}

/** The tenant a write should be attributed to: null for system/admin, else the caller's. */
function writeTenantId(): string | null {
  return callerIsSystem() ? null : getCurrentTenantId();
}

/** Visibility filter for reads — global for system/admin, global ∪ own for tenants. */
function visibilityWhere(): { callerTenantId: string | null; where: Prisma.ScenarioWhereInput } {
  if (callerIsSystem()) return { callerTenantId: null, where: { tenantId: null } };
  const callerTenantId = getCurrentTenantId();
  return { callerTenantId, where: { OR: [{ tenantId: null }, { tenantId: callerTenantId }] } };
}

function rowToScenario(row: ScenarioRow): Scenario {
  const doc = (yaml.load(row.yamlContent) ?? {}) as Record<string, unknown>;
  return {
    ...(doc as object),
    name: typeof doc['name'] === 'string' ? (doc['name'] as string) : row.name,
    channel: (doc['channel'] as Scenario['channel']) ?? (row.channel as Scenario['channel']),
    // The UI keys runs/edits off `filePath` = the `relpath.yaml#index` source ref.
    filePath: row.sourceRef ?? undefined,
    owner: row.owner,
    lifecycle_status: parseLifecycleStatus(row.lifecycleStatus) ?? 'active',
    revision_count: row._count.revisions,
    last_revision_at: row.lastRevisionAt ? row.lastRevisionAt.toISOString() : null,
  } as Scenario;
}

/** De-dupe rows by a key, preferring the caller's own-tenant row over a global one. */
function dedupePreferOwn(
  rows: ScenarioRow[],
  keyOf: (row: ScenarioRow) => string | null,
  callerTenantId: string | null,
): ScenarioRow[] {
  const byKey = new Map<string, ScenarioRow>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key == null) continue;
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, row);
      continue;
    }
    if (row.tenantId === callerTenantId && current.tenantId !== callerTenantId) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** List the scenarios visible to the current caller, reconstructed from the DB. */
export async function listScenariosFromDb(): Promise<Scenario[]> {
  const { callerTenantId, where } = visibilityWhere();
  const rows = (await runAsSystem(async () =>
    prisma.scenario.findMany({
      // Hide deprecated scenarios (e.g. pre-reorg orphans) from the catalog/pickers.
      where: { AND: [where, { lifecycleStatus: { not: 'deprecated' } }] },
      select: SCENARIO_ROW_SELECT,
    }),
  )) as ScenarioRow[];

  return dedupePreferOwn(rows, (r) => r.filePath, callerTenantId)
    .map(rowToScenario)
    .sort((a, b) => (a.filePath ?? '').localeCompare(b.filePath ?? ''));
}

/** Raw YAML for one scenario by its `relpath.yaml#index` source ref, or null. */
export async function getScenarioYamlByRef(sourceRef: string): Promise<string | null> {
  const { callerTenantId, where } = visibilityWhere();
  const rows = (await runAsSystem(async () =>
    prisma.scenario.findMany({
      where: { AND: [where, { sourceRef }] },
      select: SCENARIO_ROW_SELECT,
    }),
  )) as ScenarioRow[];
  const picked = dedupePreferOwn(rows, (r) => r.sourceRef, callerTenantId)[0];
  return picked ? picked.yamlContent : null;
}

/** Resolve `relpath.yaml#index` refs to scenarios (run creation). Throws on a missing ref. */
export async function resolveScenariosByRefs(refs: string[]): Promise<Scenario[]> {
  const uniqueRefs = [...new Set(refs)];
  if (uniqueRefs.length === 0) return [];

  const { callerTenantId, where } = visibilityWhere();
  const rows = (await runAsSystem(async () =>
    prisma.scenario.findMany({
      where: { AND: [where, { sourceRef: { in: uniqueRefs } }] },
      select: SCENARIO_ROW_SELECT,
    }),
  )) as ScenarioRow[];

  const byRef = new Map<string, ScenarioRow>();
  for (const row of dedupePreferOwn(rows, (r) => r.sourceRef, callerTenantId)) {
    if (row.sourceRef) byRef.set(row.sourceRef, row);
  }

  return refs.map((ref) => {
    const row = byRef.get(ref);
    if (!row) throw new Error(`Scenario not found: ${ref}`);
    return rowToScenario(row);
  });
}

/**
 * Resolve all scenario docs belonging to a relative file (sourceRef `<file>#<n>`),
 * ordered by doc index. `index` picks a single doc. Run creation.
 */
export async function resolveScenariosByFile(relativeFile: string, index?: number): Promise<Scenario[]> {
  const { callerTenantId, where } = visibilityWhere();
  const rows = (await runAsSystem(async () =>
    prisma.scenario.findMany({
      where: { AND: [where, { sourceRef: { startsWith: `${relativeFile}#` } }] },
      select: SCENARIO_ROW_SELECT,
    }),
  )) as ScenarioRow[];

  const ordered = dedupePreferOwn(rows, (r) => r.sourceRef, callerTenantId)
    .map((row) => ({ row, idx: Number.parseInt(row.sourceRef?.split('#')[1] ?? '', 10) }))
    .filter((entry) => Number.isFinite(entry.idx))
    .sort((a, b) => a.idx - b.idx);

  if (index != null) {
    const picked = ordered.find((entry) => entry.idx === index);
    return picked ? [rowToScenario(picked.row)] : [];
  }
  return ordered.map((entry) => rowToScenario(entry.row));
}

/** Relative file paths (the part of sourceRef before `#`) visible to the caller. */
export async function listScenarioFilesFromDb(): Promise<string[]> {
  const { callerTenantId, where } = visibilityWhere();
  const rows = (await runAsSystem(async () =>
    prisma.scenario.findMany({ where, select: SCENARIO_ROW_SELECT }),
  )) as ScenarioRow[];
  const files = new Set<string>();
  for (const row of dedupePreferOwn(rows, (r) => r.sourceRef, callerTenantId)) {
    const file = row.sourceRef?.split('#')[0];
    if (file) files.add(file);
  }
  return [...files].sort();
}

/** Reconstruct a file's full multi-doc YAML from the DB (docs joined by `---`), or null. */
export async function getScenarioFileContentFromDb(relativeFile: string): Promise<string | null> {
  const docs = await resolveScenariosByFile(relativeFile);
  if (docs.length === 0) return null;
  // resolveScenariosByFile returns reconstructed Scenario objects; re-dump each
  // (minus loader metadata) so the editor sees the same canonical YAML the DB holds.
  const body = docs
    .map((doc) => {
      const { filePath, owner, lifecycle_status, revision_count, last_revision_at, ...fields } =
        doc as unknown as Record<string, unknown>;
      void filePath; void owner; void lifecycle_status; void revision_count; void last_revision_at;
      return yaml.dump(fields, { lineWidth: -1, noRefs: true }).trimEnd();
    })
    .join('\n---\n');
  return `${body}\n`;
}

/** True when the caller may also write YAML files to disk (admin/system only). A
 *  tenant must never write to the shared scenarios dir — it would be re-imported as
 *  a GLOBAL scenario on restart and leak across tenants. Tenant writes are DB-only. */
export function shouldWriteScenarioFiles(): boolean {
  return callerIsSystem();
}

interface ScenarioMetadata {
  owner: string | null;
  lifecycleStatus: ScenarioLifecycleStatus;
  revisionCount: number;
  lastRevisionAt: string | null;
}

/** Revision history + metadata for one scenario_id, scoped to the caller's view. */
export async function getScenarioRevisions(scenarioId: string): Promise<{
  metadata: { owner: string | null; lifecycleStatus: ScenarioLifecycleStatus; lastRevisionAt: string | null };
  revisions: Array<{ id: string; source: string; sourceRef: string | null; changedBy: string | null; createdAt: string }>;
} | null> {
  const key = makeScenarioKey(scenarioId);
  const { callerTenantId, where } = visibilityWhere();
  const rows = await runAsSystem(async () =>
    prisma.scenario.findMany({
      where: { AND: [where, { filePath: key }] },
      select: {
        tenantId: true,
        owner: true,
        lifecycleStatus: true,
        lastRevisionAt: true,
        revisions: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          select: { id: true, source: true, sourceRef: true, changedBy: true, createdAt: true },
        },
      },
    }),
  );

  if (rows.length === 0) return null;
  const record =
    rows.find((r) => r.tenantId === callerTenantId) ?? rows.find((r) => r.tenantId === null) ?? rows[0]!;

  return {
    metadata: {
      owner: record.owner,
      lifecycleStatus: parseLifecycleStatus(record.lifecycleStatus) ?? 'active',
      lastRevisionAt: record.lastRevisionAt ? record.lastRevisionAt.toISOString() : null,
    },
    revisions: record.revisions.map((revision) => ({
      id: revision.id,
      source: revision.source,
      sourceRef: revision.sourceRef,
      changedBy: revision.changedBy,
      createdAt: revision.createdAt.toISOString(),
    })),
  };
}

/** Update owner / lifecycle status on the caller's own scenario row. Returns null if absent. */
export async function updateScenarioMetadata(
  scenarioId: string,
  patch: { owner?: string | null; lifecycleStatus?: ScenarioLifecycleStatus },
): Promise<ScenarioMetadata | null> {
  const key = makeScenarioKey(scenarioId);
  const tenantId = writeTenantId();

  const existing = await prisma.scenario.findFirst({ where: { filePath: key, tenantId }, select: { id: true } });
  if (!existing) return null;

  const data: Prisma.ScenarioUpdateInput = {};
  if (patch.owner !== undefined) data.owner = patch.owner;
  if (patch.lifecycleStatus !== undefined) data.lifecycleStatus = patch.lifecycleStatus;

  const updated = await prisma.scenario.update({
    where: { id: existing.id },
    data,
    select: { owner: true, lifecycleStatus: true, lastRevisionAt: true, _count: { select: { revisions: true } } },
  });

  return {
    owner: updated.owner,
    lifecycleStatus: parseLifecycleStatus(updated.lifecycleStatus) ?? 'active',
    revisionCount: updated._count.revisions,
    lastRevisionAt: updated.lastRevisionAt ? updated.lastRevisionAt.toISOString() : null,
  };
}

/** Count the WRITER's own docs (own tenant, or global for admin) for a relative file. */
export async function countOwnScenarioDocsForFile(relativeFile: string): Promise<number> {
  const tenantId = writeTenantId();
  return runAsSystem(async () =>
    prisma.scenario.count({ where: { tenantId, sourceRef: { startsWith: `${relativeFile}#` } } }),
  );
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Create or update the DB state for one scenario doc, recording a revision when the
 * content changes. Tenant attribution is EXPLICIT (not left to the guard) so the
 * write is correct whether or not the guard reaches inside the transaction:
 *   - system/admin → the global row (tenantId = null)
 *   - tenant user  → the caller's own row (copy-on-write off a global)
 */
export async function upsertScenarioState(
  normalizedDoc: NormalizedScenarioDoc,
  sourceRef: string,
  source: 'create' | 'edit' | 'sync',
  changedBy: string | null,
  metadata?: { owner?: string | null; lifecycleStatus?: ScenarioLifecycleStatus },
): Promise<UpsertResult> {
  const key = makeScenarioKey(normalizedDoc.scenarioId);
  const tenantId = writeTenantId();
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existing = await tx.scenario.findFirst({
      where: { filePath: key, tenantId },
      select: { id: true, contentHash: true, owner: true, lifecycleStatus: true },
    });

    const scenario = existing
      ? await tx.scenario.update({
        where: { id: existing.id },
        data: {
          sourceRef,
          name: normalizedDoc.name,
          channel: normalizedDoc.channel,
          description: normalizedDoc.description,
          yamlContent: normalizedDoc.yamlContent,
          contentHash: normalizedDoc.contentHash,
          owner: metadata?.owner !== undefined ? metadata.owner : existing.owner,
          lifecycleStatus: metadata?.lifecycleStatus ?? existing.lifecycleStatus,
        },
        select: { id: true },
      })
      : await tx.scenario.create({
        data: {
          tenantId,
          filePath: key,
          sourceRef,
          name: normalizedDoc.name,
          channel: normalizedDoc.channel,
          description: normalizedDoc.description,
          yamlContent: normalizedDoc.yamlContent,
          contentHash: normalizedDoc.contentHash,
          owner: metadata?.owner ?? null,
          lifecycleStatus: metadata?.lifecycleStatus ?? 'active',
          lastRevisionAt: now,
        },
        select: { id: true },
      });

    const contentChanged = !existing || existing.contentHash !== normalizedDoc.contentHash;
    if (!contentChanged) return existing ? 'unchanged' : 'created';

    await tx.scenarioRevision.upsert({
      where: { scenarioId_contentHash: { scenarioId: scenario.id, contentHash: normalizedDoc.contentHash } },
      update: { sourceRef, yamlContent: normalizedDoc.yamlContent, source, changedBy },
      create: {
        scenarioId: scenario.id,
        sourceRef,
        yamlContent: normalizedDoc.yamlContent,
        contentHash: normalizedDoc.contentHash,
        source,
        changedBy,
      },
    });

    await tx.scenario.update({ where: { id: scenario.id }, data: { lastRevisionAt: now } });
    return existing ? 'updated' : 'created';
  });
}

// ── Startup import ────────────────────────────────────────────────────────────

/**
 * Seed the GLOBAL scenario library from the bundled YAML directory. Runs at boot
 * as the system context, so rows land with tenantId = null. Idempotent: bundled
 * docs lack a scenario_id, so we derive a STABLE id from the sourceRef — unchanged
 * files produce no new revisions, changed files record a `sync` revision.
 */
export async function importScenariosFromDir(
  dir: string,
): Promise<{ created: number; updated: number; total: number; skipped: number }> {
  if (!existsSync(dir)) return { created: 0, updated: 0, total: 0, skipped: 0 };

  const fileScenarios = loadScenariosFromDir(dir);
  let created = 0;
  let updated = 0;
  let skipped = 0;

  await runAsSystem(async () => {
    for (const scenario of fileScenarios) {
      const sourceRef = scenario.filePath; // `relpath.yaml#index`
      if (!sourceRef) {
        skipped++;
        continue;
      }

      // Strip loader-added metadata; keep only the YAML doc fields.
      const { filePath, owner, lifecycle_status, revision_count, last_revision_at, ...docFields } =
        scenario as unknown as Record<string, unknown>;
      void filePath; void owner; void lifecycle_status; void revision_count; void last_revision_at;

      if (typeof docFields['scenario_id'] !== 'string' || !(docFields['scenario_id'] as string).trim()) {
        docFields['scenario_id'] = deterministicScenarioId(sourceRef);
      }

      const normalized = normalizeScenarioDoc(docFields, 1, false);
      if (!normalized.doc) {
        skipped++;
        continue;
      }

      const result = await upsertScenarioState(normalized.doc, sourceRef, 'sync', null);
      if (result === 'created') created++;
      else if (result === 'updated') updated++;
    }

    // Prune: disk-synced scenarios (tenantId null) whose source file no longer
    // exists — e.g. moved during the domain reorg — are marked deprecated so they
    // drop out of the pickers. Not deleted, so historical runs keep their link.
    const validRefs = new Set(
      fileScenarios
        .map((s) => (s as unknown as { filePath?: string }).filePath)
        .filter((r): r is string => !!r),
    );
    if (validRefs.size > 0) {
      await prisma.scenario.updateMany({
        where: {
          tenantId: null,
          sourceRef: { not: null },
          lifecycleStatus: { not: 'deprecated' },
          NOT: { sourceRef: { in: [...validRefs] } },
        },
        data: { lifecycleStatus: 'deprecated' },
      });
    }
  });

  return { created, updated, total: fileScenarios.length, skipped };
}
