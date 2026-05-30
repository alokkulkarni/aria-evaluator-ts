// src/ui/lib/api.ts
// Thin fetch wrapper that points at the API server

const API_BASE = (import.meta as unknown as { env: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? '';

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.json();
}
