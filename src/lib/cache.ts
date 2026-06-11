// src/lib/cache.ts
// Redis client initialization and session/token management

import Redis from 'ioredis';
import Bull from 'bull';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '0'),
  password: process.env.REDIS_PASSWORD,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  maxRetriesPerRequest: null,
});

redis.on('connect', () => console.info('[Redis] Connected'));
redis.on('error', (error) => console.error('[Redis] Connection error:', error));

// Session management
const SESSION_TTL = 24 * 60 * 60; // 24 hours
const TOKEN_BLACKLIST_TTL = 7 * 24 * 60 * 60; // 7 days

export async function storeSession(
  sessionId: string,
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const sessionData = {
    userId,
    ipAddress,
    userAgent,
    lastSeenAt: new Date().toISOString(),
  };

  await redis.setex(
    `session:${sessionId}`,
    SESSION_TTL,
    JSON.stringify(sessionData)
  );
}

export async function getSession(
  sessionId: string
): Promise<{ userId: string; ipAddress?: string; userAgent?: string } | null> {
  const data = await redis.get(`session:${sessionId}`);
  return data ? JSON.parse(data) : null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(`session:${sessionId}`);
}

// Token blacklist (for logout)
export async function blacklistToken(token: string): Promise<void> {
  await redis.setex(`token:blacklist:${token}`, TOKEN_BLACKLIST_TTL, '1');
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const result = await redis.get(`token:blacklist:${token}`);
  return result !== null;
}

// OAuth state management
const OAUTH_STATE_TTL = 5 * 60; // 5 minutes

export async function storeOAuthState(state: string, data: any): Promise<void> {
  await redis.setex(
    `oauth:state:${state}`,
    OAUTH_STATE_TTL,
    JSON.stringify(data)
  );
}

export async function getOAuthState(state: string): Promise<any> {
  const data = await redis.get(`oauth:state:${state}`);
  if (data) {
    await redis.del(`oauth:state:${state}`);
    return JSON.parse(data);
  }
  return null;
}

// Job queue
export const jobQueue = new Bull('aria-evaluations', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    db: parseInt(process.env.REDIS_DB || '0'),
    password: process.env.REDIS_PASSWORD,
  },
});

jobQueue.on('error', (error) => console.error('[JobQueue] Error:', error));
jobQueue.on('completed', (job) => console.info(`[JobQueue] Job ${job.id} completed`));
jobQueue.on('failed', (job, error) => console.error(`[JobQueue] Job ${job.id} failed:`, error));

// Cache statistics
export async function getCacheStats(): Promise<{
  memoryUsage: number;
  connectedClients: number;
  usedMemoryPercent: number;
  keyCount: number;
}> {
  const info = await redis.info('memory');
  const keys = await redis.keys('*');

  const lines = info.split('\r\n');
  const usedMemory = parseInt(
    lines.find((l) => l.startsWith('used_memory:'))?.split(':')[1] || '0'
  );
  const maxMemory = parseInt(
    lines.find((l) => l.startsWith('maxmemory:'))?.split(':')[1] || '0'
  );

  const clients = await redis.info('clients');
  const connectedClients = parseInt(
    clients.split('\r\n').find((l) => l.startsWith('connected_clients:'))?.split(':')[1] || '0'
  );

  return {
    memoryUsage: usedMemory,
    connectedClients,
    usedMemoryPercent: maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0,
    keyCount: keys.length,
  };
}

const AUTH_SESSION_CACHE_TTL = 60; // seconds

export async function cacheAuthSession(tokenHash: string, data: object): Promise<void> {
  await redis.setex(`auth-session:${tokenHash}`, AUTH_SESSION_CACHE_TTL, JSON.stringify(data));
}

export async function getCachedAuthSession(tokenHash: string): Promise<object | null> {
  const raw = await redis.get(`auth-session:${tokenHash}`);
  return raw ? (JSON.parse(raw) as object) : null;
}

export async function invalidateCachedAuthSession(tokenHash: string): Promise<void> {
  await redis.del(`auth-session:${tokenHash}`);
}

/**
 * Read-through cache: returns cached value if present, otherwise calls fetcher,
 * caches the result for ttlSeconds, and returns it.
 * Errors from Redis are swallowed — the fetcher is called as fallback.
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 300,
): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through to fetcher
  }
  const value = await fetcher();
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Ignore cache write failures
  }
  return value;
}

export async function invalidateCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch {
    // Ignore
  }
}

export async function invalidateCachePattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Ignore
  }
}

export default redis;
