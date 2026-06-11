// src/jobs/heartbeat.ts
// Emits a liveness heartbeat to the control plane every HEARTBEAT_INTERVAL_SECONDS.
// Only active when CONTROL_PLANE_INTERNAL_URL and TENANT_ID are set (SaaS mode).

import { prisma } from '../db/client.js';

const INTERVAL_MS = Math.max(
  60_000,
  (Number.parseInt(process.env['HEARTBEAT_INTERVAL_SECONDS'] ?? '600', 10) || 600) * 1000,
);

const CONTROL_PLANE_URL = process.env['CONTROL_PLANE_INTERNAL_URL']?.trim();
const TENANT_ID = process.env['TENANT_ID']?.trim();
const INTERNAL_SECRET = process.env['CONTROL_PLANE_INTERNAL_SECRET']?.trim();

let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

async function collectMetrics(): Promise<{ runsThisMonth: number; scenariosUsed: number; activeUsers: number }> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [runsThisMonth, scenariosUsed, activeUsers] = await Promise.all([
    prisma.run.count({
      where: { createdAt: { gte: monthStart }, status: { not: 'deleted' } },
    }),
    prisma.scenario.count({
      where: { lifecycleStatus: { not: 'deprecated' } },
    }),
    prisma.authSession.count({
      where: { expiresAt: { gte: now } },
    }),
  ]);

  return { runsThisMonth, scenariosUsed, activeUsers };
}

async function sendHeartbeat(): Promise<void> {
  if (!CONTROL_PLANE_URL || !TENANT_ID) return;

  try {
    const metrics = await collectMetrics();
    const body = JSON.stringify({ tenantId: TENANT_ID, metrics });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (INTERNAL_SECRET) {
      headers['Authorization'] = `Bearer ${INTERNAL_SECRET}`;
    }

    const response = await fetch(`${CONTROL_PLANE_URL}/instance/heartbeat`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[Heartbeat] Control plane responded ${response.status}`);
    } else {
      console.debug(`[Heartbeat] OK — runs: ${metrics.runsThisMonth}, scenarios: ${metrics.scenariosUsed}`);
    }
  } catch (err) {
    // Heartbeat failure is non-fatal — log and continue
    console.warn(`[Heartbeat] Failed to reach control plane: ${(err as Error).message}`);
  }
}

function scheduleNext(): void {
  heartbeatTimer = setTimeout(() => {
    void sendHeartbeat().finally(scheduleNext);
  }, INTERVAL_MS);
  heartbeatTimer.unref?.();
}

export function startHeartbeatEmitter(): void {
  if (!CONTROL_PLANE_URL || !TENANT_ID) return; // not in SaaS mode

  console.info(`[Heartbeat] Starting — interval ${INTERVAL_MS / 1000}s, tenant ${TENANT_ID}`);

  // Send immediately on startup, then on schedule
  void sendHeartbeat().finally(scheduleNext);
}

export function stopHeartbeatEmitter(): void {
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}
