// src/ui/lib/api.ts
// Thin fetch wrapper that points at the API server

const API_BASE = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`${status} ${responseText}`);
    this.status = status;
    this.responseText = responseText;
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
    throw new ApiError(res.status, text);
  }
  return res.json();
}
