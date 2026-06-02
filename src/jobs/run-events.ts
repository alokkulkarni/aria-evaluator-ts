import { prisma } from '../db/client.js';
import { emitSseEvent } from '../api/sse-bus.js';

export type RunEventType = 'queued' | 'start' | 'log' | 'complete' | 'failed';

interface StoredRunEvent {
  id: number;
  eventType: RunEventType;
  payload: Record<string, unknown>;
}

const runEventQueues = new Map<string, Promise<void>>();

function enqueueRunEvent<T>(runId: string, task: () => Promise<T>): Promise<T> {
  const previous = runEventQueues.get(runId) ?? Promise.resolve();
  const next = previous.then(task, task);

  const queuePromise = next.then(() => undefined, () => undefined);
  runEventQueues.set(runId, queuePromise);

  void queuePromise.finally(() => {
    // Auto-clean once the queue drains (unless a newer task replaced it).
    if (runEventQueues.get(runId) === queuePromise) runEventQueues.delete(runId);
  });
  return next;
}

export function publishRunEvent(
  runId: string,
  eventType: RunEventType,
  payload: Record<string, unknown>,
): Promise<number> {
  return enqueueRunEvent(runId, async () => {
    try {
      const created = await prisma.runEvent.create({
        data: {
          runId,
          eventType,
          payloadJson: JSON.stringify(payload),
        },
        select: { id: true },
      });
      emitSseEvent(runId, eventType, payload, created.id);
      return created.id;
    } catch (err) {
      // Keep live clients updated even if event persistence fails.
      emitSseEvent(runId, eventType, payload);
      throw err;
    }
  });
}

export async function publishRunEventSafe(
  runId: string,
  eventType: RunEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await publishRunEvent(runId, eventType, payload);
  } catch (err) {
    console.error(`Failed to persist ${eventType} event for run ${runId}: ${(err as Error).message}`);
  }
}

export async function waitForRunEventQueue(runId: string): Promise<void> {
  await (runEventQueues.get(runId) ?? Promise.resolve());
}

export function clearRunEventQueue(runId: string): void {
  runEventQueues.delete(runId);
}

export async function hasRunEvents(runId: string): Promise<boolean> {
  const count = await prisma.runEvent.count({ where: { runId } });
  return count > 0;
}

export async function listRunEvents(runId: string, startFromId: number): Promise<StoredRunEvent[]> {
  const rows = await prisma.runEvent.findMany({
    where: {
      runId,
      ...(startFromId > 0 ? { id: { gte: startFromId } } : {}),
    },
    orderBy: { id: 'asc' },
    select: { id: true, eventType: true, payloadJson: true },
  });

  const output: StoredRunEvent[] = [];
  for (const row of rows) {
    const eventType = row.eventType as RunEventType;
    if (
      eventType !== 'queued' &&
      eventType !== 'start' &&
      eventType !== 'log' &&
      eventType !== 'complete' &&
      eventType !== 'failed'
    ) {
      continue;
    }

    try {
      const payload = JSON.parse(row.payloadJson) as Record<string, unknown>;
      output.push({ id: row.id, eventType, payload });
    } catch {
      // Skip malformed payload rows rather than failing the whole stream.
    }
  }
  return output;
}
