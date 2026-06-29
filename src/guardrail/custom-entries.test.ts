import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    customGuardrailDomain: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    customGuardrailFunction: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
}));
vi.mock('../db/client.js', () => ({ prisma: mocks.prisma }));

import {
  createCustomDomain,
  createCustomFunction,
  customSlug,
  deleteCustomDomain,
  listCustomEntries,
} from './custom-entries.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('customSlug', () => {
  it('prefixes custom- and slugifies', () => {
    expect(customSlug('Mortgage Advisor')).toBe('custom-mortgage-advisor');
    expect(customSlug('  Edu/Tech 2.0!! ')).toBe('custom-edu-tech-2-0');
  });

  it('always yields a slug-safe id (matches the API slug regex), even for junk input', () => {
    for (const label of ['../etc', '🙂🙂', '', '   ']) {
      expect(customSlug(label)).toMatch(/^[a-z0-9-]+$/);
      expect(customSlug(label).startsWith('custom-')).toBe(true);
    }
  });
});

describe('listCustomEntries', () => {
  it('maps rows to id/label/description views, functions keep their domainSlug as domainId', async () => {
    mocks.prisma.customGuardrailDomain.findMany.mockResolvedValue([
      { slug: 'custom-education', label: 'Education', description: 'desc' },
    ]);
    mocks.prisma.customGuardrailFunction.findMany.mockResolvedValue([
      { slug: 'custom-tutor', label: 'Tutor', description: 'd', domainSlug: 'custom-education' },
      { slug: 'custom-mortgage', label: 'Mortgage', description: 'd', domainSlug: 'banking' },
    ]);
    const out = await listCustomEntries('t1');
    expect(out.domains).toEqual([{ id: 'custom-education', label: 'Education', description: 'desc' }]);
    expect(out.functions).toContainEqual({
      id: 'custom-mortgage',
      label: 'Mortgage',
      description: 'd',
      domainId: 'banking',
    });
    // scoped to the tenant
    expect(mocks.prisma.customGuardrailDomain.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1' } }),
    );
  });
});

describe('createCustomDomain / createCustomFunction', () => {
  it('upserts a domain by (tenant, derived slug) and returns the view', async () => {
    mocks.prisma.customGuardrailDomain.upsert.mockResolvedValue({
      slug: 'custom-education',
      label: 'Education',
      description: 'K-12',
    });
    const out = await createCustomDomain('t1', 'u1', 'Education', 'K-12');
    expect(out).toEqual({ id: 'custom-education', label: 'Education', description: 'K-12' });
    const args = mocks.prisma.customGuardrailDomain.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({ tenantId_slug: { tenantId: 't1', slug: 'custom-education' } });
    expect(args.create).toMatchObject({ tenantId: 't1', slug: 'custom-education', createdBy: 'u1' });
  });

  it('upserts a function keyed by (tenant, domainSlug, slug)', async () => {
    mocks.prisma.customGuardrailFunction.upsert.mockResolvedValue({
      slug: 'custom-tutor',
      label: 'Tutor',
      description: 'd',
      domainSlug: 'custom-education',
    });
    const out = await createCustomFunction('t1', 'u1', 'custom-education', 'Tutor', 'd');
    expect(out.domainId).toBe('custom-education');
    const args = mocks.prisma.customGuardrailFunction.upsert.mock.calls[0]![0];
    expect(args.where).toEqual({
      tenantId_domainSlug_slug: { tenantId: 't1', domainSlug: 'custom-education', slug: 'custom-tutor' },
    });
  });
});

describe('deleteCustomDomain', () => {
  it('removes the domain and any functions under it (tenant-scoped)', async () => {
    mocks.prisma.customGuardrailFunction.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.customGuardrailDomain.deleteMany.mockResolvedValue({ count: 1 });
    await deleteCustomDomain('t1', 'custom-education');
    expect(mocks.prisma.customGuardrailFunction.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', domainSlug: 'custom-education' },
    });
    expect(mocks.prisma.customGuardrailDomain.deleteMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', slug: 'custom-education' },
    });
  });
});
