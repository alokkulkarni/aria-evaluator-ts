// Persistence for saved, reusable custom Guardrail Advisor domains & functions.
// Workspace/tenant-scoped: anyone in the tenant can create, only admins delete (the
// admin check lives in the route). Slugs are derived server-side from the label so the
// "custom-…" id can't be spoofed, and they match the client's slugify so the wizard's
// in-memory ids line up with the persisted ones.
import { prisma } from '../db/client.js';

export interface CustomDomainView {
  id: string; // the "custom-…" slug
  label: string;
  description: string;
}

export interface CustomFunctionView {
  id: string; // the "custom-…" slug
  label: string;
  description: string;
  domainId: string; // parent domain id (curated id or custom slug)
}

export interface CustomEntries {
  domains: CustomDomainView[];
  functions: CustomFunctionView[];
}

/** Slugify a label to a safe `custom-…` id (mirrors the client so ids line up). */
export function customSlug(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return `custom-${base || 'entry'}`;
}

/** All custom domains + functions saved for a tenant. */
export async function listCustomEntries(tenantId: string): Promise<CustomEntries> {
  const [domains, functions] = await Promise.all([
    prisma.customGuardrailDomain.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customGuardrailFunction.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    }),
  ]);
  return {
    domains: domains.map((d) => ({ id: d.slug, label: d.label, description: d.description })),
    functions: functions.map((f) => ({
      id: f.slug,
      label: f.label,
      description: f.description,
      domainId: f.domainSlug,
    })),
  };
}

/** Create (or update by slug) a custom domain. Idempotent on (tenant, slug). */
export async function createCustomDomain(
  tenantId: string,
  createdBy: string | null,
  label: string,
  description: string,
): Promise<CustomDomainView> {
  const slug = customSlug(label);
  const row = await prisma.customGuardrailDomain.upsert({
    where: { tenantId_slug: { tenantId, slug } },
    update: { label, description },
    create: { tenantId, slug, label, description, createdBy },
  });
  return { id: row.slug, label: row.label, description: row.description };
}

/** Create (or update by slug) a custom function under a domain. Idempotent. */
export async function createCustomFunction(
  tenantId: string,
  createdBy: string | null,
  domainId: string,
  label: string,
  description: string,
): Promise<CustomFunctionView> {
  const slug = customSlug(label);
  const row = await prisma.customGuardrailFunction.upsert({
    where: { tenantId_domainSlug_slug: { tenantId, domainSlug: domainId, slug } },
    update: { label, description },
    create: { tenantId, domainSlug: domainId, slug, label, description, createdBy },
  });
  return { id: row.slug, label: row.label, description: row.description, domainId: row.domainSlug };
}

/** Delete a custom domain and any functions saved under it (tenant-scoped, idempotent). */
export async function deleteCustomDomain(tenantId: string, slug: string): Promise<void> {
  await prisma.customGuardrailFunction.deleteMany({ where: { tenantId, domainSlug: slug } });
  await prisma.customGuardrailDomain.deleteMany({ where: { tenantId, slug } });
}

/** Delete a single custom function by slug under a domain (tenant-scoped, idempotent). */
export async function deleteCustomFunction(
  tenantId: string,
  domainId: string,
  slug: string,
): Promise<void> {
  await prisma.customGuardrailFunction.deleteMany({ where: { tenantId, domainSlug: domainId, slug } });
}
