export class ControlPlaneError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`Control plane request failed (${status})`);
    this.status = status;
    this.responseText = responseText;
  }
}

function getControlPlaneBaseUrl(): string {
  const configured = process.env['CONTROL_PLANE_INTERNAL_URL']?.trim().replace(/\/$/, '');
  if (configured) return configured;
  throw new Error('CONTROL_PLANE_INTERNAL_URL is not set');
}

function getInternalHeaders(headers?: HeadersInit): Headers {
  const output = new Headers(headers);
  if (!output.has('Content-Type')) {
    output.set('Content-Type', 'application/json');
  }

  const internalSecret = process.env['CONTROL_PLANE_INTERNAL_SECRET']?.trim();
  if (internalSecret) {
    output.set('Authorization', `Bearer ${internalSecret}`);
  }

  return output;
}

export async function controlPlaneInternalFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getControlPlaneBaseUrl()}${path}`, {
    ...init,
    headers: getInternalHeaders(init?.headers),
  });

  if (!response.ok) {
    throw new ControlPlaneError(response.status, await response.text());
  }

  return response.json() as Promise<T>;
}

export function getWebsiteBaseUrl(): string {
  const configured = [
    process.env['ARIA_WEBSITE_URL'],
    process.env['WEBSITE_URL'],
    process.env['MARKETING_SITE_URL'],
  ]
    .map((value) => value?.trim())
    .find((value): value is string => !!value);

  if (configured) return configured.replace(/\/$/, '');

  const deployEnv = (process.env['ARIA_DEPLOY_ENV'] ?? process.env['ENVIRONMENT'] ?? '').trim().toLowerCase();
  if (deployEnv === 'local' || process.env['NODE_ENV'] !== 'production') {
    return 'http://localhost:3000';
  }

  return 'https://ariaeval.io';
}

export function getWebsiteSignOutUrl(): string {
  return `${getWebsiteBaseUrl()}/sign-out`;
}
