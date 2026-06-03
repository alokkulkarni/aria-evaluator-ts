import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { prisma } from '../db/client.js';
import { recordAuditEventSafe } from './audit-log.js';

const SECURE_SESSION_COOKIE_NAME = '__Host-aria_session';
const DEV_SESSION_COOKIE_NAME = 'aria_session';
const parsedSessionTtlHours = Number.parseInt(process.env['AUTH_SESSION_TTL_HOURS'] ?? '168', 10);
const SESSION_TTL_HOURS = Number.isNaN(parsedSessionTtlHours) ? 168 : Math.max(1, parsedSessionTtlHours);
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 12;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;
const PASSWORD_HASH_VERSION = 'v1';
const TEMP_PASSWORD_HASH_VERSION = 'v1tmp';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_MAX_KEYS = 2_000;

interface AuthRateLimitBucket {
  count: number;
  resetAtMs: number;
}

const loginRateLimits = new Map<string, AuthRateLimitBucket>();

export interface AuthContext {
  userId: string;
  username: string;
  role: string;
  sessionId: string;
  requirePasswordChange: boolean;
}

export interface AuthenticatedRequest extends Request {
  auth?: AuthContext;
}

interface LoginBody {
  username?: string;
  password?: string;
  bootstrapToken?: string;
  currentPassword?: string;
  newPassword?: string;
}

export const authRouter = Router();

function parseCookies(rawCookie: string | undefined): Record<string, string> {
  if (!rawCookie) return {};
  const entries = rawCookie.split(';');
  const output: Record<string, string> = {};
  for (const entry of entries) {
    const idx = entry.indexOf('=');
    if (idx <= 0) continue;
    const key = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    if (!key) continue;
    try {
      output[key] = decodeURIComponent(value);
    } catch {
      output[key] = value;
    }
  }
  return output;
}

function cookieSameSite(): 'Lax' | 'None' {
  const configured = process.env['AUTH_COOKIE_SAMESITE']?.trim().toLowerCase();
  if (configured === 'none') return 'None';
  return 'Lax';
}

function cookieSecure(): boolean {
  if (cookieSameSite() === 'None') return true;
  return process.env['NODE_ENV'] === 'production';
}

function activeSessionCookieName(): string {
  return cookieSecure() ? SECURE_SESSION_COOKIE_NAME : DEV_SESSION_COOKIE_NAME;
}

function readSessionToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[activeSessionCookieName()]
    ?? cookies[DEV_SESSION_COOKIE_NAME]
    ?? cookies[SECURE_SESSION_COOKIE_NAME];
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashPassword(password: string, salt?: string, options?: { temporary?: boolean }): string {
  const effectiveSalt = salt ?? randomBytes(16).toString('hex');
  const digest = scryptSync(password, effectiveSalt, 64).toString('hex');
  const version = options?.temporary ? TEMP_PASSWORD_HASH_VERSION : PASSWORD_HASH_VERSION;
  return `${version}$${effectiveSalt}$${digest}`;
}

function verifyPassword(storedHash: string, candidatePassword: string): boolean {
  const [version, salt, expectedHash] = storedHash.split('$');
  if ((version !== PASSWORD_HASH_VERSION && version !== TEMP_PASSWORD_HASH_VERSION) || !salt || !expectedHash) return false;

  const computedHash = hashPassword(candidatePassword, salt, { temporary: version === TEMP_PASSWORD_HASH_VERSION }).split('$')[2];
  if (!computedHash) return false;

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  if (expectedBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, computedBuffer);
}

function isTemporaryPasswordHash(storedHash: string): boolean {
  const [version] = storedHash.split('$');
  return version === TEMP_PASSWORD_HASH_VERSION;
}

function serializeCookie(name: string, value: string, options: {
  maxAgeSeconds?: number;
  httpOnly?: boolean;
  sameSite?: 'Lax' | 'None' | 'Strict';
  secure?: boolean;
  path?: string;
  expires?: Date;
}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAgeSeconds != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeSeconds))}`);
  if (options.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  return parts.join('; ');
}

function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  const maxAgeSeconds = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const cookieName = activeSessionCookieName();
  const staleCookieName = cookieName === SECURE_SESSION_COOKIE_NAME
    ? DEV_SESSION_COOKIE_NAME
    : SECURE_SESSION_COOKIE_NAME;

  res.setHeader('Set-Cookie', [
    serializeCookie(cookieName, token, {
      maxAgeSeconds,
      expires: expiresAt,
      path: '/',
      httpOnly: true,
      sameSite: cookieSameSite(),
      secure: cookieName === SECURE_SESSION_COOKIE_NAME,
    }),
    serializeCookie(staleCookieName, '', {
      maxAgeSeconds: 0,
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      sameSite: cookieSameSite(),
      secure: staleCookieName === SECURE_SESSION_COOKIE_NAME,
    }),
  ]);
}

function clearSessionCookie(res: Response): void {
  res.setHeader('Set-Cookie', [
    serializeCookie(DEV_SESSION_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      sameSite: cookieSameSite(),
      secure: false,
    }),
    serializeCookie(SECURE_SESSION_COOKIE_NAME, '', {
      maxAgeSeconds: 0,
      expires: new Date(0),
      path: '/',
      httpOnly: true,
      sameSite: cookieSameSite(),
      secure: true,
    }),
  ]);
}

function normalizeUsername(rawUsername: string | undefined): string | null {
  const value = rawUsername?.trim() ?? '';
  if (!USERNAME_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

function normalizePassword(rawPassword: string | undefined): string | null {
  const value = rawPassword ?? '';
  if (value.length < PASSWORD_MIN_LENGTH) return null;
  return value;
}

function parseBooleanEnv(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

export async function ensureDefaultAdminAccount(): Promise<void> {
  const stateBucket = process.env['AWS_S3_STATE_BUCKET']?.trim() ?? '';
  const localModeDefault = stateBucket.length === 0;
  const enabled = parseBooleanEnv(
    process.env['AUTH_DEFAULT_ADMIN_ENABLED'],
    localModeDefault,
  );
  if (!enabled) {
    console.log('ℹ Default admin auto-bootstrap disabled (AUTH_DEFAULT_ADMIN_ENABLED=false).');
    return;
  }

  const requestedUsername = process.env['AUTH_DEFAULT_ADMIN_USERNAME']?.trim() ?? 'admin';
  const username = normalizeUsername(requestedUsername);
  if (!username) {
    throw new Error('AUTH_DEFAULT_ADMIN_USERNAME is invalid (allowed: 3-64 chars, letters/numbers/_.-)');
  }

  const legacyRecoveryEnabled = parseBooleanEnv(
    process.env['AUTH_DEFAULT_ADMIN_RECOVER_LEGACY'],
    localModeDefault,
  );
  const forceResetExisting = parseBooleanEnv(
    process.env['AUTH_DEFAULT_ADMIN_FORCE_RESET_EXISTING'],
    false,
  );
  const providedPassword = process.env['AUTH_DEFAULT_ADMIN_PASSWORD']?.trim() ?? '';
  const existingUsers = await prisma.user.findMany({
    select: { id: true, username: true, role: true, passwordHash: true },
  });
  if (existingUsers.length > 0) {
    const defaultAdmin = existingUsers.find((user) => user.role === 'admin' && user.username === username);
    let hasPasswordChangeAudit = false;
    if (defaultAdmin) {
      const passwordChangeAudit = await prisma.auditLog.findFirst({
        where: {
          userId: defaultAdmin.id,
          action: 'auth.password_changed',
        },
        select: { id: true },
      });
      hasPasswordChangeAudit = !!passwordChangeAudit;
    }
    const shouldRotateExisting =
      !!defaultAdmin && (
        isTemporaryPasswordHash(defaultAdmin.passwordHash)
        || (legacyRecoveryEnabled && !hasPasswordChangeAudit)
        || (forceResetExisting && existingUsers.length === 1)
      );
    if (defaultAdmin && shouldRotateExisting) {
      const rotatedPassword = normalizePassword(providedPassword || randomBytes(18).toString('base64url'));
      if (!rotatedPassword) {
        throw new Error(`AUTH_DEFAULT_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
      }
      await prisma.user.update({
        where: { id: defaultAdmin.id },
        data: {
          passwordHash: hashPassword(rotatedPassword, undefined, { temporary: true }),
          lastLoginAt: null,
        },
      });

      console.warn('\n⚠ Temporary admin password rotated');
      console.warn(`   Username: ${defaultAdmin.username}`);
      console.warn(`   Password: ${rotatedPassword}`);
      console.warn('   Sign in once and set a permanent password.');
      console.warn('   Override with AUTH_DEFAULT_ADMIN_USERNAME / AUTH_DEFAULT_ADMIN_PASSWORD');
      console.warn('   Disable with AUTH_DEFAULT_ADMIN_ENABLED=false\n');
      return;
    }

    console.log(`ℹ Default admin auto-bootstrap skipped (${existingUsers.length} existing user(s)).`);
    return;
  }

  const password = normalizePassword(providedPassword || randomBytes(18).toString('base64url'));
  if (!password) {
    throw new Error(`AUTH_DEFAULT_ADMIN_PASSWORD must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }

  const createdUser = await prisma.$transaction(async (tx) => {
    const count = await tx.user.count();
    if (count > 0) return null;

    await tx.bootstrapState.upsert({
      where: { id: 1 },
      update: {},
      create: { id: 1 },
    });

    return tx.user.create({
      data: {
        username,
        passwordHash: hashPassword(password, undefined, { temporary: true }),
        role: 'admin',
      },
      select: { id: true, username: true, role: true },
    });
  });

  if (!createdUser) {
    console.log('ℹ Default admin auto-bootstrap skipped (user created concurrently).');
    return;
  }

  console.warn('\n⚠ Auto-created default admin account');
  console.warn(`   Username: ${createdUser.username}`);
  console.warn(`   Password: ${password}`);
  console.warn('   This temporary password must be changed after first sign-in.');
  console.warn('   Override with AUTH_DEFAULT_ADMIN_USERNAME / AUTH_DEFAULT_ADMIN_PASSWORD');
  console.warn('   Disable with AUTH_DEFAULT_ADMIN_ENABLED=false\n');
}

function sweepExpiredRateLimits(): void {
  const now = Date.now();
  for (const [key, bucket] of loginRateLimits.entries()) {
    if (bucket.resetAtMs <= now) loginRateLimits.delete(key);
  }

  if (loginRateLimits.size <= LOGIN_RATE_LIMIT_MAX_KEYS) return;

  const overflow = loginRateLimits.size - LOGIN_RATE_LIMIT_MAX_KEYS;
  let removed = 0;
  for (const key of loginRateLimits.keys()) {
    loginRateLimits.delete(key);
    removed += 1;
    if (removed >= overflow) break;
  }
}

function cleanupRateLimit(key: string): AuthRateLimitBucket | null {
  const existing = loginRateLimits.get(key);
  if (!existing) return null;
  if (existing.resetAtMs <= Date.now()) {
    loginRateLimits.delete(key);
    return null;
  }
  return existing;
}

function isRateLimited(key: string): boolean {
  sweepExpiredRateLimits();
  const bucket = cleanupRateLimit(key);
  return !!bucket && bucket.count >= LOGIN_MAX_ATTEMPTS;
}

function registerFailedAttempt(key: string): void {
  sweepExpiredRateLimits();
  const existing = cleanupRateLimit(key);
  if (existing) {
    existing.count += 1;
    loginRateLimits.set(key, existing);
    return;
  }
  loginRateLimits.set(key, { count: 1, resetAtMs: Date.now() + LOGIN_WINDOW_MS });
}

function clearRateLimit(key: string): void {
  loginRateLimits.delete(key);
}

function getRequestIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function normalizeIpAddress(address: string): string {
  const normalized = address.trim().toLowerCase();
  return normalized.startsWith('::ffff:') ? normalized.slice(7) : normalized;
}

function isLoopbackAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = normalizeIpAddress(address);
  return normalized === '::1'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

function isPrivateIpv4Address(address: string | null | undefined): boolean {
  if (!address) return false;
  const normalized = normalizeIpAddress(address);
  const octets = normalized.split('.');
  if (octets.length !== 4) return false;
  const values = octets.map((octet) => Number.parseInt(octet, 10));
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const first = values[0] ?? -1;
  const second = values[1] ?? -1;
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.trim().toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (host.startsWith('localhost:') || host.startsWith('127.0.0.1:')) return true;
  if (host.startsWith('[::1]')) return true;
  return false;
}

function isTrustedLocalContainerRequest(req: Request): boolean {
  // If forwarded headers are present, treat as proxied traffic and require token.
  if (req.get('x-forwarded-for')) return false;
  if (!isLoopbackHostHeader(req.get('host') ?? undefined)) return false;
  const remoteAddress = req.socket.remoteAddress;
  return isLoopbackAddress(remoteAddress) || isPrivateIpv4Address(remoteAddress);
}

function isLoopbackRequest(req: Request): boolean {
  return isLoopbackAddress(getRequestIp(req)) || isTrustedLocalContainerRequest(req);
}

function constantTimeEqual(input: string, expected: string): boolean {
  const a = Buffer.from(input, 'utf-8');
  const b = Buffer.from(expected, 'utf-8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function createSessionForUser(userId: string): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);
  const session = await prisma.authSession.create({
    data: { userId, tokenHash, expiresAt },
    select: { id: true },
  });
  return { sessionId: session.id, token, expiresAt };
}

export function getRequestAuth(req: Request): AuthContext | null {
  return (req as AuthenticatedRequest).auth ?? null;
}

export async function attachAuthContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessionToken = readSessionToken(req);
    if (!sessionToken) {
      next();
      return;
    }

    const tokenHash = hashToken(sessionToken);
    const session = await prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session) {
      clearSessionCookie(res);
      next();
      return;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await prisma.authSession.delete({ where: { id: session.id } });
      clearSessionCookie(res);
      next();
      return;
    }

    (req as AuthenticatedRequest).auth = {
      userId: session.userId,
      username: session.user.username,
      role: session.user.role,
      sessionId: session.id,
      requirePasswordChange: isTemporaryPasswordHash(session.user.passwordHash),
    };

    const shouldRefreshLastSeen = !session.lastSeenAt
      || (Date.now() - session.lastSeenAt.getTime()) > SESSION_REFRESH_INTERVAL_MS;
    if (shouldRefreshLastSeen) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getRequestAuth(req);
  if (!auth) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getRequestAuth(req);
  if (!auth || auth.role !== 'admin') {
    res.status(403).json({ error: 'Admin authorization required' });
    return;
  }
  next();
}

authRouter.get('/bootstrap-status', async (_req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      bootstrapRequired: userCount === 0,
      tokenRequired: !!process.env['AUTH_BOOTSTRAP_TOKEN']?.trim(),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.post('/bootstrap', async (req, res) => {
  try {
    const { username: rawUsername, password: rawPassword, bootstrapToken: rawBootstrapToken } = req.body as LoginBody;
    const username = normalizeUsername(rawUsername);
    const password = normalizePassword(rawPassword);
    if (!username || !password) {
      res.status(400).json({ error: 'Invalid username or password' });
      return;
    }

    const configuredBootstrapToken = process.env['AUTH_BOOTSTRAP_TOKEN']?.trim();
    const providedBootstrapToken = (req.get('x-bootstrap-token') ?? rawBootstrapToken ?? '').trim();
    if (configuredBootstrapToken) {
      if (!providedBootstrapToken || !constantTimeEqual(providedBootstrapToken, configuredBootstrapToken)) {
        res.status(403).json({ error: 'Invalid bootstrap token' });
        return;
      }
    } else if (!isLoopbackRequest(req)) {
      res.status(403).json({ error: 'Bootstrap is restricted to loopback requests unless AUTH_BOOTSTRAP_TOKEN is set' });
      return;
    }

    const createdUser = await prisma.$transaction(async (tx) => {
      const existingUsers = await tx.user.count();
      if (existingUsers > 0) {
        throw new Error('BOOTSTRAP_ALREADY_COMPLETED');
      }
      await tx.bootstrapState.create({ data: { id: 1 } });
      return tx.user.create({
        data: {
          username,
          passwordHash: hashPassword(password),
          role: 'admin',
          lastLoginAt: new Date(),
        },
        select: { id: true, username: true, role: true },
      });
    });

    const session = await createSessionForUser(createdUser.id);
    setSessionCookie(res, session.token, session.expiresAt);
    (req as AuthenticatedRequest).auth = {
      userId: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
      sessionId: session.sessionId,
      requirePasswordChange: false,
    };
    await recordAuditEventSafe(req, 'auth.bootstrap', createdUser.id, {
      username: createdUser.username,
      role: createdUser.role,
    });

    res.status(201).json({
      ok: true,
      requirePasswordChange: false,
      user: createdUser,
    });
  } catch (err) {
    if ((err as Error).message === 'BOOTSTRAP_ALREADY_COMPLETED') {
      res.status(409).json({ error: 'Bootstrap already completed' });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const { username: rawUsername, password: rawPassword } = req.body as LoginBody;
    const username = normalizeUsername(rawUsername);
    const password = rawPassword ?? '';
    if (!username || !password) {
      res.status(400).json({ error: 'Invalid username or password' });
      return;
    }

    const requestIp = getRequestIp(req);
    const ipRateKey = `ip:${requestIp}`;
    const userRateKey = `user:${username}`;
    if (isRateLimited(ipRateKey) || isRateLimited(userRateKey)) {
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, passwordHash: true },
    });
    if (!user || !verifyPassword(user.passwordHash, password)) {
      registerFailedAttempt(ipRateKey);
      registerFailedAttempt(userRateKey);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    clearRateLimit(ipRateKey);
    clearRateLimit(userRateKey);
    const requirePasswordChange = isTemporaryPasswordHash(user.passwordHash);

    const session = await createSessionForUser(user.id);
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    setSessionCookie(res, session.token, session.expiresAt);
    (req as AuthenticatedRequest).auth = {
      userId: user.id,
      username: user.username,
      role: user.role,
      sessionId: session.sessionId,
      requirePasswordChange,
    };
    await recordAuditEventSafe(req, 'auth.login', user.id, {
      username: user.username,
      role: user.role,
    });

    res.json({
      ok: true,
      requirePasswordChange,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.post('/change-password', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { currentPassword: rawCurrentPassword, newPassword: rawNewPassword } = req.body as LoginBody;
    const currentPassword = rawCurrentPassword ?? '';
    const newPassword = normalizePassword(rawNewPassword);
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, username: true, role: true, passwordHash: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!verifyPassword(user.passwordHash, currentPassword)) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    if (verifyPassword(user.passwordHash, newPassword)) {
      res.status(400).json({ error: 'New password must be different from the current password' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(newPassword),
        lastLoginAt: new Date(),
      },
    });
    await prisma.authSession.deleteMany({
      where: {
        userId: user.id,
        id: { not: auth.sessionId },
      },
    });
    await recordAuditEventSafe(req, 'auth.password_changed', user.id, {
      username: user.username,
      role: user.role,
      forcedRotation: auth.requirePasswordChange,
    });

    (req as AuthenticatedRequest).auth = {
      ...auth,
      requirePasswordChange: false,
    };
    res.json({
      ok: true,
      requirePasswordChange: false,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.post('/logout', async (req, res) => {
  try {
    const sessionToken = readSessionToken(req);
    const auth = getRequestAuth(req);
    if (sessionToken) {
      await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(sessionToken) } });
    }
    if (auth) {
      await recordAuditEventSafe(req, 'auth.logout', auth.userId, {
        username: auth.username,
        role: auth.role,
      });
    }
    clearSessionCookie(res);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.get('/session', (req, res) => {
  const auth = getRequestAuth(req);
  if (!auth) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    requirePasswordChange: auth.requirePasswordChange,
    user: {
      id: auth.userId,
      username: auth.username,
      role: auth.role,
    },
  });
});
