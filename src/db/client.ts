// src/db/client.ts
import { PrismaClient } from '@prisma/client';

const parsedBusyTimeoutMs = Number.parseInt(process.env['SQLITE_BUSY_TIMEOUT_MS'] ?? '5000', 10);
const busyTimeoutMs = Math.max(0, Number.isNaN(parsedBusyTimeoutMs) ? 5000 : parsedBusyTimeoutMs);

const logLevel: ('warn' | 'error')[] =
  process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'];

export const prisma = new PrismaClient({ log: logLevel });

// Read-replica client: uses DATABASE_READ_REPLICA_URL when set (e.g. RDS read replica),
// otherwise falls back to the primary connection so local/SQLite deployments need no change.
const replicaUrl = process.env['DATABASE_READ_REPLICA_URL'];
export const prismaRead: PrismaClient = replicaUrl
  ? new PrismaClient({
      log: logLevel,
      datasources: { db: { url: replicaUrl } },
    })
  : prisma;

/** Returns the appropriate read client (replica if configured, primary otherwise). */
export function getReadClient(): PrismaClient {
  return prismaRead;
}

let initPromise: Promise<void> | null = null;

export async function initDb(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await prisma.$connect();
    // SQLite-specific pragmas (no-op on PostgreSQL — driver ignores unknown pragmas)
    await prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${busyTimeoutMs}`);

    if (replicaUrl) {
      await prismaRead.$connect();
      console.info('[DB] Read replica connected:', replicaUrl.replace(/:[^@]*@/, ':***@'));
    }
  })();

  return initPromise;
}
