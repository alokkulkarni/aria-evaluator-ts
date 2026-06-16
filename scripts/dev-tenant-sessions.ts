#!/usr/bin/env node
// Dev-only harness: create two simulated SSO tenant users, each with an active
// session, so you can test tenant isolation locally under TENANT_SCOPING_MODE=enforce
// WITHOUT the control-plane SSO flow. Prints each tenant's session cookie + a curl
// example. NOT for production — it mints sessions directly in the DB.
//
// Prereqs: the local stack is up on Postgres (the aria-postgres-local container).
//
//   DATABASE_URL='postgresql://aria:aria@localhost:5432/aria?schema=public' \
//     npx tsx scripts/dev-tenant-sessions.ts
//
// Then paste a cookie into your browser (or the curl below) to act as that tenant.

import { randomBytes, createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANTS = [
  { externalId: 'dev-tenant-acme', label: 'acme' },
  { externalId: 'dev-tenant-globex', label: 'globex' },
];

function makeSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

async function main(): Promise<void> {
  const baseUrl = (process.env['ARIA_BASE_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
  console.log('Creating dev tenant sessions…\n');

  for (const t of TENANTS) {
    const tenant = await prisma.tenant.upsert({
      where: { externalId: t.externalId },
      update: { name: t.label },
      create: { externalId: t.externalId, name: t.label },
    });

    // ssoSubject must be set so the evaluator treats this as a tenant user
    // (non-SSO users are the unrestricted system context).
    const ssoSubject = `dev_sso_${t.label}`;
    const user = await prisma.user.upsert({
      where: { ssoSubject },
      update: { tenantId: tenant.id },
      create: {
        username: `dev_${t.label}`,
        ssoSubject,
        email: `${t.label}@dev.local`,
        role: 'admin',
        tenantId: tenant.id,
        passwordHash: 'sso-dev-no-login',
      },
    });

    const { token, tokenHash } = makeSessionToken();
    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash,
        tenantId: tenant.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    console.log(`Tenant "${t.label}"  (tenantId=${tenant.id})`);
    console.log(`  Cookie:  aria_session=${token}`);
    console.log(`  curl -s -H 'Cookie: aria_session=${token}' ${baseUrl}/api/runs | head -c 400`);
    console.log('');
  }

  console.log('With TENANT_SCOPING_MODE=enforce on the evaluator, each cookie sees only its own tenant.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
