import type { Response } from 'express';

const sseClients = new Map<string, Response[]>();

export function emitSseEvent(runId: string, event: string, data: unknown): void {
  const clients = sseClients.get(runId) ?? [];
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(payload);
    } catch {
      // Ignore disconnected clients; unregister happens on close.
    }
  }
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
