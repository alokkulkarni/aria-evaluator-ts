import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { prisma } from '../db/client.js';
import { getCachedAuthSession, cacheAuthSession, invalidateCachedAuthSession } from '../lib/cache.js';
import { recordAuditEventSafe } from './audit-log.js';
import { getWebsiteSignOutUrl } from './control-plane.js';

const SECURE_SESSION_COOKIE_NAME = '__Host-aria_session';
const DEV_SESSION_COOKIE_NAME = 'aria_session';
const parsedSessionTtlHours = Number.parseInt(process.env['AUTH_SESSION_TTL_HOURS'] ?? '168', 10);
const SESSION_TTL_HOURS = Number.isNaN(parsedSessionTtlHours) ? 168 : Math.max(1, parsedSessionTtlHours);
const SESSION_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle timeout (SOC2 CC6.1)
const MAX_CONCURRENT_SESSIONS = 5;
const PASSWORD_MIN_LENGTH = 12;
const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,64}$/;
const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/;
const PASSWORD_HASH_VERSION = 'v1';
const TEMP_PASSWORD_HASH_VERSION = 'v1tmp';
const CLIENT_HASH_PREFIX = 'sha256:';

/**
 * Strips the client-side SHA-256 prefix if present.
 * The client hashes the plaintext password before transit (defense-in-depth).
 * The server then applies scrypt on the received value (hash or plaintext).
 */
function normalizeClientPassword(raw: string): string {
  if (raw.startsWith(CLIENT_HASH_PREFIX)) {
    return raw.slice(CLIENT_HASH_PREFIX.length);
  }
  return raw;
}

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
  email: string | null;
  ssoSubject: string | null;
  workspaceEligible: boolean;
  requirePasswordChange: boolean;
  suspended: boolean;
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

function verifyPassword(storedHash: string | null, candidatePassword: string): boolean {
  if (!storedHash) return false;
  const [version, salt, expectedHash] = storedHash.split('$');
  if ((version !== PASSWORD_HASH_VERSION && version !== TEMP_PASSWORD_HASH_VERSION) || !salt || !expectedHash) return false;

  const computedHash = hashPassword(candidatePassword, salt, { temporary: version === TEMP_PASSWORD_HASH_VERSION }).split('$')[2];
  if (!computedHash) return false;

  const expectedBuffer = Buffer.from(expectedHash, 'hex');
  const computedBuffer = Buffer.from(computedHash, 'hex');
  if (expectedBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, computedBuffer);
}

function isTemporaryPasswordHash(storedHash: string | null): boolean {
  if (!storedHash) return false;
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
  // Skip complexity check for client-hashed passwords (already validated on client)
  if (!value.startsWith(CLIENT_HASH_PREFIX) && !PASSWORD_COMPLEXITY_PATTERN.test(value)) return null;
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

    // 1. Try Redis cache first (60 s TTL, shared across instances)
    const cached = await getCachedAuthSession(tokenHash).catch(() => null);
    if (cached) {
      (req as AuthenticatedRequest).auth = cached as AuthContext;
      next();
      return;
    }

    // 2. Cache miss — fall through to DB
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
      invalidateCachedAuthSession(tokenHash).catch(() => {});
      clearSessionCookie(res);
      next();
      return;
    }

    // Idle timeout: expire session if no activity for SESSION_IDLE_TIMEOUT_MS
    if (session.lastSeenAt && (Date.now() - session.lastSeenAt.getTime()) > SESSION_IDLE_TIMEOUT_MS) {
      await prisma.authSession.delete({ where: { id: session.id } });
      invalidateCachedAuthSession(tokenHash).catch(() => {});
      clearSessionCookie(res);
      next();
      return;
    }

    const authContext: AuthContext = {
      userId: session.userId,
      username: session.user.username,
      role: session.user.role,
      sessionId: session.id,
      email: session.user.email,
      ssoSubject: session.user.ssoSubject,
      workspaceEligible: !!session.user.ssoSubject,
      requirePasswordChange: isTemporaryPasswordHash(session.user.passwordHash),
      suspended: session.user.suspended,
    };

    // 3. Store in cache (fire-and-forget — never block the request path)
    cacheAuthSession(tokenHash, authContext).catch(() => {});

    (req as AuthenticatedRequest).auth = authContext;

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
  if (auth.requirePasswordChange) {
    res.status(428).json({
      error: 'Password change required',
      requirePasswordChange: true,
    });
    return;
  }
  // GDPR Art. 18: suspended accounts can only manage their own account
  if (auth.suspended) {
    const accountPaths = ['/api/auth/account', '/api/auth/session', '/api/auth/sessions', '/api/auth/logout'];
    const isAccountRoute = accountPaths.some((p) => req.path.startsWith(p));
    if (!isAccountRoute) {
      res.status(403).json({
        error: 'Account suspended',
        message: 'Your account processing is restricted (GDPR Art. 18). Contact support or unrestrict your account.',
        suspended: true,
      });
      return;
    }
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
    const sanitizedPassword = normalizeClientPassword(password);

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
          passwordHash: hashPassword(sanitizedPassword),          role: 'admin',
          lastLoginAt: new Date(),
        },
        select: { id: true, username: true, role: true, email: true, ssoSubject: true },
      });
    });

    const session = await createSessionForUser(createdUser.id);
    setSessionCookie(res, session.token, session.expiresAt);
    (req as AuthenticatedRequest).auth = {
      userId: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
      sessionId: session.sessionId,
      email: createdUser.email,
      ssoSubject: createdUser.ssoSubject,
      workspaceEligible: !!createdUser.ssoSubject,
      requirePasswordChange: false,
      suspended: false,
    };
    await recordAuditEventSafe(req, 'auth.bootstrap', createdUser.id, {
      username: createdUser.username,
      role: createdUser.role,
    });

    res.status(201).json({
      ok: true,
      requirePasswordChange: false,
      user: {
        id: createdUser.id,
        username: createdUser.username,
        role: createdUser.role,
        workspaceEligible: !!createdUser.ssoSubject,
      },
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
    const sanitizedPassword = normalizeClientPassword(password);

    const requestIp = getRequestIp(req);
    const ipRateKey = `ip:${requestIp}`;
    const userRateKey = `user:${username}`;
    if (isRateLimited(ipRateKey) || isRateLimited(userRateKey)) {
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true, role: true, email: true, ssoSubject: true, passwordHash: true, suspended: true },
    });
    if (!user || !verifyPassword(user.passwordHash, sanitizedPassword)) {
      registerFailedAttempt(ipRateKey);
      registerFailedAttempt(userRateKey);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    clearRateLimit(ipRateKey);
    clearRateLimit(userRateKey);
    const requirePasswordChange = isTemporaryPasswordHash(user.passwordHash);

    // Enforce max concurrent sessions — evict oldest if at limit
    const existingSessions = await prisma.authSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (existingSessions.length >= MAX_CONCURRENT_SESSIONS) {
      const toEvict = existingSessions.slice(0, existingSessions.length - MAX_CONCURRENT_SESSIONS + 1);
      await prisma.authSession.deleteMany({
        where: { id: { in: toEvict.map((s) => s.id) } },
      });
    }

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
      email: user.email,
      ssoSubject: user.ssoSubject,
      workspaceEligible: !!user.ssoSubject,
      requirePasswordChange,
      suspended: user.suspended,
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
        workspaceEligible: !!user.ssoSubject,
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
    const currentPassword = normalizeClientPassword(rawCurrentPassword ?? '');
    const newPassword = normalizePassword(rawNewPassword);
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
      return;
    }
    const sanitizedNewPassword = normalizeClientPassword(newPassword);

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, username: true, role: true, email: true, ssoSubject: true, passwordHash: true },
    });
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (!user.passwordHash) {
      res.status(400).json({ error: 'Cannot change password for SSO account' });
      return;
    }
    if (!verifyPassword(user.passwordHash, currentPassword)) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }
    if (verifyPassword(user.passwordHash, sanitizedNewPassword)) {
      res.status(400).json({ error: 'New password must be different from the current password' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashPassword(sanitizedNewPassword),
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
        workspaceEligible: !!user.ssoSubject,
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
    res.json({ ok: true, redirectTo: getWebsiteSignOutUrl() });
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
      workspaceEligible: auth.workspaceEligible,
    },
  });
});

// ── Active session management ────────────────────────────────────────────────

authRouter.get('/sessions', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const sessions = await prisma.authSession.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastSeenAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      currentSessionId: auth.sessionId,
      maxConcurrent: MAX_CONCURRENT_SESSIONS,
      sessions: sessions.map((s) => ({
        id: s.id,
        current: s.id === auth.sessionId,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        lastSeenAt: s.lastSeenAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const targetSessionId = req.params['sessionId'];
    if (targetSessionId === auth.sessionId) {
      res.status(400).json({ error: 'Cannot revoke current session. Use logout instead.' });
      return;
    }

    const deleted = await prisma.authSession.deleteMany({
      where: { id: targetSessionId, userId: auth.userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    await recordAuditEventSafe(req, 'auth.session_revoked', auth.userId, {
      revokedSessionId: targetSessionId,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GDPR: Data export (Art. 20 — right to data portability) ──────────────────

authRouter.get('/account/export', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        ssoSubject: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const sessions = await prisma.authSession.findMany({
      where: { userId: auth.userId },
      select: { id: true, createdAt: true, expiresAt: true, lastSeenAt: true },
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: { userId: auth.userId },
      select: { action: true, target: true, createdAt: true, ipAddress: true, userAgent: true },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });

    // Include evaluation data (runs, scores) for full data portability
    const evaluationRuns = await prisma.run.findMany({
      where: {
        job: { is: null },  // filter to user-visible runs
      },
      select: {
        id: true,
        scenarioName: true,
        channel: true,
        status: true,
        startedAt: true,
        completedAt: true,
        evalResult: {
          select: {
            overallScore: true,
            passed: true,
            summary: true,
            judgeModel: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    await recordAuditEventSafe(req, 'gdpr.data_export', auth.userId, {
      username: auth.username,
    });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="aria-data-export-${auth.userId}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      gdprArticle: 'Art. 20 — Right to data portability',
      user: {
        ...user,
        passwordHash: '[redacted]',
      },
      activeSessions: sessions.length,
      auditLog: auditLogs,
      evaluationData: {
        runs: evaluationRuns,
        totalRuns: evaluationRuns.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GDPR: Account deletion (Art. 17 — right to erasure) ─────────────────────

authRouter.delete('/account', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Record deletion audit event BEFORE deleting (retained for compliance)
    await recordAuditEventSafe(req, 'gdpr.account_deletion_requested', auth.userId, {
      username: auth.username,
      role: auth.role,
    });

    // Delete all sessions
    await prisma.authSession.deleteMany({ where: { userId: auth.userId } });

    // Anonymize audit logs (retain for compliance but remove PII)
    await prisma.auditLog.updateMany({
      where: { userId: auth.userId },
      data: {
        userId: null,
        ipAddress: null,
        userAgent: null,
      },
    });

    // Delete the user account
    await prisma.user.delete({ where: { id: auth.userId } });

    clearSessionCookie(res);

    await recordAuditEventSafe(req, 'gdpr.account_deleted', undefined, {
      deletedUserId: auth.userId,
      deletedUsername: auth.username,
    });

    res.json({
      ok: true,
      message: 'Account and personal data have been deleted. Anonymized audit logs are retained for compliance.',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── GDPR: Restriction of processing (Art. 18) ───────────────────────────────

authRouter.post('/account/restrict', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { suspended: true, suspendedAt: new Date() },
    });

    // Invalidate all sessions except current (user needs to see the confirmation)
    await prisma.authSession.deleteMany({
      where: { userId: auth.userId, id: { not: auth.sessionId } },
    });

    await recordAuditEventSafe(req, 'gdpr.processing_restricted', auth.userId, {
      username: auth.username,
      article: 'Art. 18 — Right to restriction of processing',
    });

    res.json({
      ok: true,
      message: 'Processing of your data has been restricted. Your account is suspended and data will only be stored, not actively processed.',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

authRouter.post('/account/unrestrict', async (req, res) => {
  try {
    const auth = getRequestAuth(req);
    if (!auth) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { suspended: false, suspendedAt: null },
    });

    await recordAuditEventSafe(req, 'gdpr.processing_unrestricted', auth.userId, {
      username: auth.username,
    });

    res.json({ ok: true, message: 'Processing restriction has been lifted. Your account is fully active.' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── SSO helpers ────────────────────────────────────────────────────────────────

const SSO_PASSWORD_PLACEHOLDER = 'sso:no-password';

function isValidReturnPath(value: string | null | undefined): boolean {
  if (!value) return false;
  // Must be a relative path: starts with / but NOT // (open-redirect guard)
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//');
}

async function upsertSsoUser(params: {
  ssoSubject: string;
  email: string;
  name: string | null;
  role: string;
}): Promise<{ userId: string; isNewUser: boolean }> {
  const { ssoSubject, email, name, role } = params;
  // Use the control-plane userId directly as username — guaranteed unique,
  // no slug collision risk, and SSO users never log in via username/password.
  const safeUsername = `sso_${ssoSubject}`;
  const mappedRole = role === 'owner' || role === 'admin' ? 'admin' : 'member';

  const existing = await prisma.user.findFirst({
    where: { OR: [{ ssoSubject }, { email }] },
    select: { id: true, role: true, email: true, ssoSubject: true },
  });

  if (existing) {
    // Refresh mutable fields in case they changed on the control plane
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        email,
        ssoSubject,
        role: mappedRole,
        lastLoginAt: new Date(),
      },
    });
    return { userId: existing.id, isNewUser: false };
  }

  const created = await prisma.user.create({
    data: {
      username: safeUsername,
      email,
      ssoSubject,
      passwordHash: SSO_PASSWORD_PLACEHOLDER,
      role: mappedRole,
      lastLoginAt: new Date(),
    },
    select: { id: true },
  });
  return { userId: created.id, isNewUser: true };
}

export const ssoRouter = Router();

interface ControlPlaneUserPayload {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string | null;
}

ssoRouter.get('/', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  const returnParam = typeof req.query.return === 'string' ? req.query.return : null;
  const returnTo = isValidReturnPath(returnParam) ? returnParam! : '/';

  if (!token) {
    res.redirect(`/sign-in?error=invalid_sso`);
    return;
  }

  const controlPlaneUrl = (process.env['CONTROL_PLANE_INTERNAL_URL'] ?? '').replace(/\/$/, '');
  if (!controlPlaneUrl) {
    console.error('[SSO] CONTROL_PLANE_INTERNAL_URL is not set — SSO login unavailable');
    res.redirect('/sign-in?error=sso_unavailable');
    return;
  }

  const internalSecret = process.env['CONTROL_PLANE_INTERNAL_SECRET']?.trim() ?? '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (internalSecret) headers['Authorization'] = `Bearer ${internalSecret}`;

  let cpUser: ControlPlaneUserPayload | null = null;
  try {
    const cpRes = await fetch(`${controlPlaneUrl}/auth/verify-sso-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ token }),
    });
    if (!cpRes.ok) {
      res.redirect('/sign-in?error=invalid_sso');
      return;
    }
    const payload = await cpRes.json() as { ok: boolean; user: ControlPlaneUserPayload };
    cpUser = payload.user;
  } catch (err) {
    console.error('[SSO] Control plane verify failed:', err);
    res.redirect('/sign-in?error=sso_unavailable');
    return;
  }

  if (!cpUser?.email) {
    res.redirect('/sign-in?error=invalid_sso');
    return;
  }

  try {
    const { userId, isNewUser } = await upsertSsoUser({
      ssoSubject: cpUser.id,
      email: cpUser.email,
      name: cpUser.name,
      role: cpUser.role,
    });

    const session = await createSessionForUser(userId);
    setSessionCookie(res, session.token, session.expiresAt);

    await recordAuditEventSafe(req, 'auth.sso_login', userId, {
      ssoSubject: cpUser.id,
      email: cpUser.email,
      role: cpUser.role,
      newUser: isNewUser,
    });

    res.redirect(returnTo);
  } catch (err) {
    console.error('[SSO] Session creation failed:', err);
    res.redirect('/sign-in?error=sso_error');
  }
});
