// src/api/sse-bus.ts
// SSE event bus with Redis pub/sub for cross-instance delivery.
// Local in-memory map is the fast path for same-instance clients;
// Redis pub/sub ensures events reach clients on other ECS tasks.

import Redis from 'ioredis';
import type { Response } from 'express';

const SSE_CHANNEL_PREFIX = 'sse:run:';

// ── Local client registry ─────────────────────────────────────────────────────
const sseClients = new Map<string, Response[]>();

// ── Redis pub/sub setup ───────────────────────────────────────────────────────
// Publisher reuses the main Redis connection pattern but needs a fresh client
// so it is not blocked by subscriptions.
function makeRedisClient(): Redis {
  return new Redis({
    host: process.env['REDIS_HOST'] ?? 'localhost',
    port: Number.parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
    password: process.env['REDIS_PASSWORD'],
    db: Number.parseInt(process.env['REDIS_DB'] ?? '0', 10),
    retryStrategy: (times) => Math.min(times * 50, 2000),
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

const redisPub = makeRedisClient();
const redisSub = makeRedisClient();

let subscribed = false;

async function ensureSubscribed(): Promise<void> {
  if (subscribed) return;
  subscribed = true;
  try {
    await redisSub.connect();
    await redisSub.psubscribe(`${SSE_CHANNEL_PREFIX}*`);
    redisSub.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const runId = channel.slice(SSE_CHANNEL_PREFIX.length);
      deliverToLocalClients(runId, message);
    });
    redisSub.on('error', (err: Error) => {
      console.warn('[SSE] Redis subscriber error:', err.message);
    });
  } catch (err) {
    subscribed = false;
    console.warn('[SSE] Redis subscribe failed, falling back to local-only:', (err as Error).message);
  }
}

// ── Local delivery ────────────────────────────────────────────────────────────
function deliverToLocalClients(runId: string, payload: string): void {
  const clients = sseClients.get(runId) ?? [];
  if (clients.length === 0) return;
  const remaining: Response[] = [];
  for (const res of clients) {
    try {
      res.write(payload);
      remaining.push(res);
    } catch {
      // Client disconnected — drop it
    }
  }
  if (remaining.length > 0) sseClients.set(runId, remaining);
  else sseClients.delete(runId);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function emitSseEvent(runId: string, event: string, data: unknown, id?: number): void {
  const idLine = id !== undefined ? `id: ${id}\n` : '';
  const payload = `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  // Publish to Redis so all instances receive it (best-effort).
  // The redisSub psubscribe on this same instance will receive the message back
  // and call deliverToLocalClients, so local delivery is handled via Redis.
  redisPub.publish(`${SSE_CHANNEL_PREFIX}${runId}`, payload).catch(() => {
    // Redis unavailable — fall back to local-only delivery
    deliverToLocalClients(runId, payload);
  });
}

export function registerSseClient(runId: string, res: Response): void {
  // Ensure Redis subscription is active so this instance receives cross-instance events
  void ensureSubscribed();
  const clients = sseClients.get(runId) ?? [];
  clients.push(res);
  sseClients.set(runId, clients);
}

export function unregisterSseClient(runId: string, res: Response): void {
  const remaining = (sseClients.get(runId) ?? []).filter((c) => c !== res);
  if (remaining.length > 0) sseClients.set(runId, remaining);
  else sseClients.delete(runId);
}
