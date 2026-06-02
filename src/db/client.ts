// src/db/client.ts
import { PrismaClient } from '@prisma/client';

const parsedBusyTimeoutMs = Number.parseInt(process.env['SQLITE_BUSY_TIMEOUT_MS'] ?? '5000', 10);
const busyTimeoutMs = Math.max(0, Number.isNaN(parsedBusyTimeoutMs) ? 5000 : parsedBusyTimeoutMs);

export const prisma = new PrismaClient({
  log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
});

let initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await prisma.$connect();
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$executeRawUnsafe(`PRAGMA busy_timeout = ${busyTimeoutMs}`);
  })();

  return initPromise;
}
