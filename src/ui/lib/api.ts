// src/ui/lib/api.ts
// Thin fetch wrapper that points at the API server

const API_BASE = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  responseText: string;
  error?: string;
  details?: string[];

  constructor(status: number, responseText: string, payload?: unknown) {
    const parsed = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const apiError = typeof parsed?.['error'] === 'string' ? parsed['error'] : null;
    super(apiError ? `${status} ${apiError}` : `${status} ${responseText}`);
    this.status = status;
    this.responseText = responseText;
    this.error = apiError ?? undefined;
    this.details = Array.isArray(parsed?.['details'])
      ? parsed?.['details'].filter((value): value is string => typeof value === 'string')
      : undefined;
  }
}

export function toApiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const url = toApiUrl(path);
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> ?? {}) },
    credentials: 'include',
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text) as unknown;
    } catch {
      payload = undefined;
    }
    throw new ApiError(res.status, text, payload);
  }
  return res.json();
}
