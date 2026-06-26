// src/ui/lib/provider-instances.ts
// Typed client for the provider-instance API (named provider configs).

import { apiFetch } from './api.js';
import type { RunProvider } from '../../shared/provider-fields.js';

export interface ProviderInstance {
  id: string;
  providerType: RunProvider;
  nickname: string;
  isDefault: boolean;
  /** Config map with secret values redacted to '***'. */
  config: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInstanceInput {
  providerType: RunProvider;
  nickname: string;
  config: Record<string, string>;
  isDefault?: boolean;
}

export async function fetchProviderInstances(provider?: string): Promise<ProviderInstance[]> {
  const q = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  const d = (await apiFetch(`/api/provider-instances${q}`)) as { instances: ProviderInstance[] };
  return d.instances ?? [];
}

export async function createProviderInstance(input: ProviderInstanceInput): Promise<ProviderInstance> {
  const d = (await apiFetch('/api/provider-instances', {
    method: 'POST',
    body: JSON.stringify(input),
  })) as { instance: ProviderInstance };
  return d.instance;
}

export async function updateProviderInstance(
  id: string,
  input: Partial<Pick<ProviderInstanceInput, 'nickname' | 'config' | 'isDefault'>>,
): Promise<ProviderInstance> {
  const d = (await apiFetch(`/api/provider-instances/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })) as { instance: ProviderInstance };
  return d.instance;
}

export async function deleteProviderInstance(id: string): Promise<void> {
  await apiFetch(`/api/provider-instances/${id}`, { method: 'DELETE' });
}
