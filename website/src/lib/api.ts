function withAuthHeader(headers: HeadersInit | undefined, authToken?: string): HeadersInit {
  if (!authToken) return headers ?? {}

  return {
    ...headers,
    Authorization: `Bearer ${authToken}`,
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit & { authToken?: string }): Promise<T> {
  const res = await fetch(`/api/control-plane${path}`, {
    headers: withAuthHeader({ 'Content-Type': 'application/json', ...options?.headers }, options?.authToken),
    ...options,
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())

  return res.json() as Promise<T>
}

export async function serverApiFetch<T>(path: string, options?: RequestInit & { authToken?: string }): Promise<T> {
  const baseUrl = process.env.CONTROL_PLANE_INTERNAL_URL ?? 'http://localhost:3002'
  const res = await fetch(`${baseUrl}${path}`, {
    headers: withAuthHeader({ 'Content-Type': 'application/json', ...options?.headers }, options?.authToken),
    ...options,
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())

  return res.json() as Promise<T>
}

export interface RegisterUserResponse {
  userId: string
  tenantId?: string
  token?: string
  emailVerified?: boolean
}

export interface CreateTenantResponse {
  tenantId: string
  status: 'queued' | 'provisioning' | 'ready' | 'failed'
  instanceUrl?: string
  ssoUrl?: string
}

export async function registerUser(data: { name: string; email: string; password: string; company?: string }) {
  return apiFetch<RegisterUserResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function createTenant(data: { plan: string; region: string; billingPeriod: string }, authToken?: string) {
  return apiFetch<CreateTenantResponse>('/tenant/provision', {
    method: 'POST',
    body: JSON.stringify(data),
    authToken,
  })
}

export async function getTenantStatus(authToken?: string) {
  return apiFetch('/tenant/me', { authToken })
}

export async function getRegions() {
  return apiFetch('/regions')
}

export async function getPackages() {
  return apiFetch('/packages')
}

export async function createSSOToken(authToken?: string) {
  const response = await apiFetch<{ ssoUrl?: string; sso_url?: string; instanceUrl?: string; instance_url?: string; token?: string }>('/instance/sso-token', {
    method: 'POST',
    authToken,
  })

  return {
    token: response.token ?? null,
    instanceUrl: response.instanceUrl ?? response.instance_url ?? null,
    ssoUrl: response.ssoUrl ?? response.sso_url ?? null,
  }
}

void apiFetch
