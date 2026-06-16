// src/lib/tenant-context.ts
// Request-scoped tenant context for the multi-tenant migration.
//
// Phase 0 (current): this is scaffolding. The context underpins the log-only
// Prisma scoping guard (src/db/client.ts) so we can surface every query that runs
// on a tenant-scoped model without a tenant. Nothing populates it yet.
//
// Phase 3: auth middleware will wrap each request in `runWithTenant(tenantId, …)`
// (tenantId sourced from the per-tenant ECS service env or the SSO claim), and the
// Prisma guard will switch from logging to enforcing.
//
// See docs/MULTI_TENANT_SPEC.md.

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string | null;
}

const storage = new AsyncLocalStorage<TenantContext>();

/** Run `fn` with the given tenant bound to the async context. */
export function runWithTenant<T>(tenantId: string | null, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

/** The tenant id bound to the current async context, or null if none/unbound. */
export function getCurrentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

/** True when a tenant context has been established for the current async flow. */
export function hasTenantContext(): boolean {
  return storage.getStore() !== undefined;
}
