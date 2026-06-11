// src/api/routes/users.ts
// Enterprise user management within an evaluator instance.
// Only available when the instance is provisioned with an enterprise plan.

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db/client.js';
import { requireAuth, requireAdminAuth, getRequestAuth } from '../auth.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getUsageLimits } from '../../shared/usage-limits.js';
import { checkUserQuota } from '../../shared/quota-enforcement.js';

export const usersRouter = Router();

const ENTERPRISE_TIERS = new Set(['enterprise_starter', 'enterprise_pro', 'enterprise_unlimited']);

function requireEnterprise(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  const limits = getUsageLimits();
  if (limits.enabled && limits.tier && !ENTERPRISE_TIERS.has(limits.tier)) {
    res.status(403).json({
      error: 'User management is available on Enterprise plans only.',
      upgradeUrl: limits.upgradeUrl,
    });
    return;
  }
  next();
}

// GET /api/users — list all active users in this instance
usersRouter.get('/', requireAuth, requireEnterprise, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { suspended: false },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        lastLoginAt: true,
        createdAt: true,
        ssoSubject: true,
        googleSub: true,
        githubId: true,
        microsoftSub: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const limits = getUsageLimits();
    res.json({
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        role: u.role,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
        authProvider: u.ssoSubject ? 'sso' : u.googleSub ? 'google' : u.githubId ? 'github' : u.microsoftSub ? 'microsoft' : 'password',
      })),
      total: users.length,
      maxUsers: limits.maxUsers,
      upgradeUrl: limits.upgradeUrl,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/users/invite — create a user record (they'll be provisioned on first SSO login)
usersRouter.post('/invite', requireAuth, requireAdminAuth, requireEnterprise, async (req, res) => {
  const parsed = z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member']).default('member'),
  }).safeParse(req.body);

  if (!parsed.success) { res.status(400).json({ error: 'email and role are required' }); return; }

  const quota = await checkUserQuota();
  if (!quota.allowed) {
    res.status(402).json({ error: quota.error, code: quota.code, upgradeUrl: getUsageLimits().upgradeUrl });
    return;
  }

  const existing = await prisma.user.findFirst({ where: { email: parsed.data.email } });
  if (existing) { res.status(409).json({ error: 'A user with this email already exists' }); return; }

  // Create a placeholder — the user activates on first SSO login via the website
  const auth = getRequestAuth(req);
  const username = `invite_${parsed.data.email.split('@')[0]}_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: parsed.data.email,
      passwordHash: 'invited:pending-sso',
      role: parsed.data.role,
    },
    select: { id: true, username: true, email: true, role: true, createdAt: true },
  });

  await recordAuditEventSafe(req, 'user.invited', auth?.userId ?? 'unknown', {
    invitedUserId: user.id,
    email: user.email,
    role: user.role,
  });

  res.status(201).json({ ok: true, user });
});

// PATCH /api/users/:userId/role — change role
usersRouter.patch('/:userId/role', requireAuth, requireAdminAuth, requireEnterprise, async (req, res) => {
  const parsed = z.object({ role: z.enum(['admin', 'member']) }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'role must be admin or member' }); return; }

  const auth = getRequestAuth(req);
  const userId = String(req.params['userId'] ?? '');

  if (userId === auth?.userId) { res.status(400).json({ error: 'Cannot change your own role' }); return; }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { role: parsed.data.role },
    select: { id: true, username: true, email: true, role: true },
  });

  await recordAuditEventSafe(req, 'user.role_changed', auth?.userId ?? 'unknown', {
    targetUserId: userId,
    oldRole: target.role,
    newRole: parsed.data.role,
  });

  res.json({ ok: true, user: updated });
});

// DELETE /api/users/:userId — remove user access
usersRouter.delete('/:userId', requireAuth, requireAdminAuth, requireEnterprise, async (req, res) => {
  const auth = getRequestAuth(req);
  const userId = String(req.params['userId'] ?? '');

  if (userId === auth?.userId) { res.status(400).json({ error: 'Cannot remove yourself' }); return; }

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
  if (!target) { res.status(404).json({ error: 'User not found' }); return; }

  // Suspend rather than hard delete to preserve audit trail
  await prisma.user.update({
    where: { id: userId },
    data: { suspended: true, suspendedAt: new Date() },
  });

  await recordAuditEventSafe(req, 'user.removed', auth?.userId ?? 'unknown', {
    removedUserId: userId,
    email: target.email,
  });

  res.json({ ok: true });
});
