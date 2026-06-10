import { apiFetch, ApiError } from '@shared/lib/api'

export { apiFetch, ApiError }
export type { RegisterUserResponse, CreateTenantResponse } from '@shared/lib/api'

const DEFAULT_CONTROL_PLANE_CACHE_TTL_MS = 60_000

let cachedControlPlaneUrl: string | null = null
let cachedControlPlaneUrlAt = 0

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/$/, '')
}

function getCacheTtlMs(): number {
  const raw = process.env.CONTROL_PLANE_URL_CACHE_TTL_MS?.trim()
  if (!raw) return DEFAULT_CONTROL_PLANE_CACHE_TTL_MS
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONTROL_PLANE_CACHE_TTL_MS
}

async function resolveControlPlaneUrlFromSsm(parameterName: string): Promise<string> {
  const now = Date.now()
  if (cachedControlPlaneUrl && now - cachedControlPlaneUrlAt < getCacheTtlMs()) {
    return cachedControlPlaneUrl
  }

  const { GetParameterCommand, SSMClient } = await import('@aws-sdk/client-ssm')
  const client = new SSMClient({})
  const response = await client.send(new GetParameterCommand({ Name: parameterName }))
  const value = response.Parameter?.Value?.trim()

  if (!value) {
    throw new Error(`SSM parameter ${parameterName} is empty`)
  }

  cachedControlPlaneUrl = normalizeBaseUrl(value)
  cachedControlPlaneUrlAt = now
  return cachedControlPlaneUrl
}

async function getControlPlaneBaseUrl(): Promise<string> {
  const configured = process.env.CONTROL_PLANE_INTERNAL_URL?.trim()
  if (configured) return normalizeBaseUrl(configured)

  const parameterName = process.env.CONTROL_PLANE_URL_SSM_PARAM_NAME?.trim()
  if (parameterName) {
    return resolveControlPlaneUrlFromSsm(parameterName)
  }

  throw new Error('CONTROL_PLANE_INTERNAL_URL is not set and CONTROL_PLANE_URL_SSM_PARAM_NAME is not set')
}

function withAuthHeader(headers: HeadersInit | undefined, authToken?: string): HeadersInit {
  if (!authToken) return headers ?? {}

  return {
    ...headers,
    Authorization: `Bearer ${authToken}`,
  }
}

export async function serverApiFetch<T>(path: string, options?: RequestInit & { authToken?: string }): Promise<T> {
  const baseUrl = await getControlPlaneBaseUrl()
  const res = await fetch(`${baseUrl}${path}`, {
    headers: withAuthHeader({ 'Content-Type': 'application/json', ...options?.headers }, options?.authToken),
    ...options,
  })

  if (!res.ok) throw new ApiError(res.status, await res.text())

  return res.json() as Promise<T>
}
