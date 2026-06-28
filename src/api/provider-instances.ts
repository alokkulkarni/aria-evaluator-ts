// src/api/provider-instances.ts
// Service layer for named provider instances (up to 5 per provider type). Each
// instance stores its config under the same env-var key names adapters read, so
// selecting one for a run is just an env overlay at the run-executor seam.
//
// Mirrors the secret-handling conventions of runtime-settings.ts: secret keys
// are redacted to '***' on read, and a '***' value on write means "leave the
// stored secret unchanged".

import { prisma } from '../db/client.js';
import { REDACTED_SECRET_VALUE, getEffectiveSettings } from './runtime-settings.js';
import {
  RUN_PROVIDERS,
  MAX_INSTANCES_PER_PROVIDER,
  type RunProvider,
  isRunProvider,
  isSecretProviderKey,
  providerConfigKeys,
  requiredProviderKeys,
} from '../shared/provider-fields.js';

// Same tenant key as runtime-settings: the deployment's TENANT_ID ("" local).
const PROCESS_TENANT = process.env['TENANT_ID']?.trim() ?? '';

const NICKNAME_MAX_LEN = 60;

export class ProviderInstanceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ProviderInstanceError';
    this.statusCode = statusCode;
  }
}

export class ProviderInstanceNotFoundError extends ProviderInstanceError {
  constructor(id: string) {
    super(`Provider instance ${id} not found`, 404);
    this.name = 'ProviderInstanceNotFoundError';
  }
}

export interface ProviderInstanceView {
  id: string;
  providerType: RunProvider;
  nickname: string;
  isDefault: boolean;
  /** Config map with secret values redacted to '***'. */
  config: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

interface ProviderInstanceRow {
  id: string;
  tenantId: string;
  providerType: string;
  nickname: string;
  configJson: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function parseConfig(configJson: string): Record<string, string> {
  try {
    const parsed = JSON.parse(configJson) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function redactConfig(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(config)) {
    out[k] = isSecretProviderKey(k) && v ? REDACTED_SECRET_VALUE : v;
  }
  return out;
}

function toView(row: ProviderInstanceRow): ProviderInstanceView {
  return {
    id: row.id,
    providerType: row.providerType as RunProvider,
    nickname: row.nickname,
    isDefault: row.isDefault,
    config: redactConfig(parseConfig(row.configJson)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Drop ASCII control characters (codepoints < 0x20 and 0x7f), keep printable
// text incl. spaces; trim and cap length.
function sanitizeNickname(raw: unknown): string {
  if (typeof raw !== 'string') throw new ProviderInstanceError('Nickname is required');
  const cleaned = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join('')
    .trim();
  if (!cleaned) throw new ProviderInstanceError('Nickname is required');
  return cleaned.slice(0, NICKNAME_MAX_LEN);
}

function assertProviderType(raw: unknown): RunProvider {
  if (typeof raw !== 'string' || !isRunProvider(raw)) {
    throw new ProviderInstanceError(`Unknown provider type: ${String(raw)}`);
  }
  return raw;
}

// Keep only keys that belong to the provider type; coerce to trimmed strings.
// When `existing` is supplied, a '***' secret value means "keep existing".
function normalizeConfig(
  providerType: RunProvider,
  rawConfig: Record<string, unknown> | undefined,
  existing?: Record<string, string>,
): Record<string, string> {
  const allowed = new Set(providerConfigKeys(providerType));
  const out: Record<string, string> = {};
  // Start from existing so an update can omit unchanged fields entirely.
  if (existing) {
    for (const [k, v] of Object.entries(existing)) {
      if (allowed.has(k) && v) out[k] = v;
    }
  }
  for (const [k, rawValue] of Object.entries(rawConfig ?? {})) {
    if (!allowed.has(k)) continue;
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (isSecretProviderKey(k) && value === REDACTED_SECRET_VALUE) continue; // leave unchanged
    if (!value) delete out[k];
    else out[k] = value;
  }
  return out;
}

async function countByType(): Promise<Map<string, number>> {
  const grouped = await prisma.providerInstance.groupBy({
    by: ['providerType'],
    where: { tenantId: PROCESS_TENANT },
    _count: { _all: true },
  });
  const map = new Map<string, number>();
  for (const g of grouped) map.set(g.providerType, g._count._all);
  return map;
}

// One-time migration: when the tenant has NO instances at all, materialize the
// legacy single-config-per-provider settings into a "Default" instance for each
// provider type that has its config present. Idempotent (skips once any instance
// exists) and best-effort. Nicety, not a correctness dependency — runs with no
// instances still work via the executor's legacy env fallback.
async function seedDefaultInstancesFromLegacy(): Promise<void> {
  const total = await prisma.providerInstance.count({ where: { tenantId: PROCESS_TENANT } });
  if (total > 0) return;

  const effective = getEffectiveSettings();
  for (const providerType of RUN_PROVIDERS) {
    const keys = providerConfigKeys(providerType);
    const config: Record<string, string> = {};
    for (const key of keys) {
      const value = effective[key as keyof typeof effective];
      if (typeof value === 'string' && value.trim()) config[key] = value.trim();
    }
    // Only seed if at least one required key for the type is present.
    const hasLegacy = requiredProviderKeys(providerType).some((k) => config[k]);
    if (!hasLegacy) continue;
    try {
      await prisma.providerInstance.create({
        data: {
          tenantId: PROCESS_TENANT,
          providerType,
          nickname: 'Default',
          configJson: JSON.stringify(config),
          isDefault: true,
        },
      });
    } catch (err) {
      console.error(`[provider-instances] seed failed for ${providerType}: ${(err as Error).message}`);
    }
  }
}

/** Idempotent startup hook (also called lazily by read paths). */
export async function ensureProviderInstancesSeeded(): Promise<void> {
  try {
    await seedDefaultInstancesFromLegacy();
  } catch (err) {
    console.error(`[provider-instances] seeding error: ${(err as Error).message}`);
  }
}

export async function listInstances(providerType?: string): Promise<ProviderInstanceView[]> {
  await ensureProviderInstancesSeeded();
  const where: { tenantId: string; providerType?: string } = { tenantId: PROCESS_TENANT };
  if (providerType) where.providerType = assertProviderType(providerType);
  const rows = await prisma.providerInstance.findMany({
    where,
    orderBy: [{ providerType: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toView);
}

async function getRow(id: string): Promise<ProviderInstanceRow> {
  const row = await prisma.providerInstance.findFirst({ where: { id, tenantId: PROCESS_TENANT } });
  if (!row) throw new ProviderInstanceNotFoundError(id);
  return row;
}

export async function getInstance(id: string): Promise<ProviderInstanceView> {
  return toView(await getRow(id));
}

async function assertNicknameUnique(
  providerType: RunProvider,
  nickname: string,
  excludeId?: string,
): Promise<void> {
  const rows = await prisma.providerInstance.findMany({
    where: { tenantId: PROCESS_TENANT, providerType },
    select: { id: true, nickname: true },
  });
  const clash = rows.some(
    (r) => r.id !== excludeId && r.nickname.toLowerCase() === nickname.toLowerCase(),
  );
  if (clash) {
    throw new ProviderInstanceError(`A ${providerType} instance named "${nickname}" already exists`);
  }
}

export interface CreateInstanceInput {
  providerType: string;
  nickname: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export async function createInstance(input: CreateInstanceInput): Promise<ProviderInstanceView> {
  const providerType = assertProviderType(input.providerType);
  const nickname = sanitizeNickname(input.nickname);
  await assertNicknameUnique(providerType, nickname);

  const counts = await countByType();
  if ((counts.get(providerType) ?? 0) >= MAX_INSTANCES_PER_PROVIDER) {
    throw new ProviderInstanceError(
      `Limit reached: at most ${MAX_INSTANCES_PER_PROVIDER} ${providerType} instances allowed`,
    );
  }

  const config = normalizeConfig(providerType, input.config);
  const makeDefault = input.isDefault === true || (counts.get(providerType) ?? 0) === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.providerInstance.updateMany({
        where: { tenantId: PROCESS_TENANT, providerType },
        data: { isDefault: false },
      });
    }
    return tx.providerInstance.create({
      data: {
        tenantId: PROCESS_TENANT,
        providerType,
        nickname,
        configJson: JSON.stringify(config),
        isDefault: makeDefault,
      },
    });
  });
  return toView(created);
}

export interface UpdateInstanceInput {
  nickname?: string;
  config?: Record<string, unknown>;
  isDefault?: boolean;
}

export async function updateInstance(id: string, input: UpdateInstanceInput): Promise<ProviderInstanceView> {
  const existing = await getRow(id);
  const providerType = existing.providerType as RunProvider;

  const nickname = input.nickname != null ? sanitizeNickname(input.nickname) : existing.nickname;
  if (input.nickname != null) await assertNicknameUnique(providerType, nickname, id);

  const config =
    input.config !== undefined
      ? normalizeConfig(providerType, input.config, parseConfig(existing.configJson))
      : parseConfig(existing.configJson);

  const makeDefault = input.isDefault === true;

  const updated = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      await tx.providerInstance.updateMany({
        where: { tenantId: PROCESS_TENANT, providerType },
        data: { isDefault: false },
      });
    }
    return tx.providerInstance.update({
      where: { id },
      data: {
        nickname,
        configJson: JSON.stringify(config),
        ...(input.isDefault !== undefined ? { isDefault: makeDefault } : {}),
      },
    });
  });
  return toView(updated);
}

export async function deleteInstance(id: string): Promise<void> {
  await getRow(id); // 404 if missing / wrong tenant
  await prisma.providerInstance.delete({ where: { id } });
}

/**
 * Resolve the concrete instance id to record on a run/schedule.
 * Order: explicit id (validated to match the type) -> the type's default ->
 * the oldest configured instance -> null (legacy env fallback).
 */
export async function resolveInstanceIdForRun(
  providerType: string,
  explicitId?: string | null,
): Promise<string | null> {
  const type = assertProviderType(providerType);
  await ensureProviderInstancesSeeded();

  if (explicitId) {
    const row = await prisma.providerInstance.findFirst({
      where: { id: explicitId, tenantId: PROCESS_TENANT },
    });
    if (!row) throw new ProviderInstanceNotFoundError(explicitId);
    if (row.providerType !== type) {
      throw new ProviderInstanceError(
        `Instance ${explicitId} is a ${row.providerType} instance, not ${type}`,
      );
    }
    return row.id;
  }

  const rows = await prisma.providerInstance.findMany({
    where: { tenantId: PROCESS_TENANT, providerType: type },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isDefault: true },
  });
  if (rows.length === 0) return null;
  return (rows.find((r) => r.isDefault) ?? rows[0]!).id;
}

export interface ProviderEnvOverlay {
  /** Provider keyspace to delete from the base env before applying the overlay. */
  stripKeys: string[];
  /** The instance's config (raw, incl. secrets) to layer onto the child env. */
  overlay: Record<string, string>;
  nickname: string;
}

/**
 * Build the env overlay for a run that selected `instanceId`. Throws
 * ProviderInstanceNotFoundError if the instance was deleted — the executor must
 * fail the run rather than silently fall back to a different (legacy) target.
 */
export async function buildProviderEnvOverlay(
  providerType: string,
  instanceId: string,
): Promise<ProviderEnvOverlay> {
  const type = assertProviderType(providerType);
  const row = await prisma.providerInstance.findFirst({
    where: { id: instanceId, tenantId: PROCESS_TENANT },
  });
  if (!row) throw new ProviderInstanceNotFoundError(instanceId);
  return {
    stripKeys: providerConfigKeys(type),
    overlay: parseConfig(row.configJson),
    nickname: row.nickname,
  };
}

/** Best-effort nickname lookup for telemetry provenance (null if deleted). */
export async function getInstanceNickname(instanceId: string): Promise<string | null> {
  try {
    const row = await prisma.providerInstance.findFirst({
      where: { id: instanceId, tenantId: PROCESS_TENANT },
      select: { nickname: true },
    });
    return row?.nickname ?? null;
  } catch {
    return null;
  }
}
