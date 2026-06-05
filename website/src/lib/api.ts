const BASE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())

  return res.json() as Promise<T>
}

export async function registerUser(data: { name: string; email: string; password: string; company?: string }) {
  void data
  console.warn('[STUB] registerUser called - control plane not yet connected')
  return { userId: 'stub-user-id', token: 'stub-token' }
}

export async function createTenant(data: { plan: string; region: string; billingPeriod: string }) {
  void data
  console.warn('[STUB] createTenant called - provisioner not yet connected')
  return { tenantId: 'stub-tenant-id', status: 'provisioning' }
}

export async function getTenantStatus() {
  return null
}

export async function getRegions() {
  return null
}

export async function getPackages() {
  return null
}

export async function createSSOToken() {
  console.warn('[STUB] SSO token - not yet connected')
  return { token: null, instanceUrl: null }
}

void apiFetch
