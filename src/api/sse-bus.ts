import type { Response } from 'express';

const sseClients = new Map<string, Response[]>();

export function emitSseEvent(runId: string, event: string, data: unknown): void {
  const clients = sseClients.get(runId) ?? [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const remaining: Response[] = [];
  for (const res of clients) {
    try {
      res.write(payload);
      remaining.push(res);
    } catch {
      // Ignore disconnected clients; we'll prune them from the list.
    }
  }
  if (remaining.length > 0) sseClients.set(runId, remaining);
  else sseClients.delete(runId);
}

export function registerSseClient(runId: string, res: Response): void {
  const clients = sseClients.get(runId) ?? [];
  clients.push(res);
  sseClients.set(runId, clients);
}

export function unregisterSseClient(runId: string, res: Response): void {
  const remaining = (sseClients.get(runId) ?? []).filter((client) => client !== res);
  if (remaining.length > 0) sseClients.set(runId, remaining);
  else sseClients.delete(runId);
}
