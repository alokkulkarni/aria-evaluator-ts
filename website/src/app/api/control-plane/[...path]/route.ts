import { type NextRequest, NextResponse } from 'next/server'

function getControlPlaneBaseUrl(): string {
  return process.env.CONTROL_PLANE_INTERNAL_URL ?? 'http://localhost:3002'
}

interface RouteContext {
  params: Promise<{ path: string[] }>
}

async function proxy(request: NextRequest, context: RouteContext) {
  const baseUrl = getControlPlaneBaseUrl().replace(/\/$/, '')
  const { path = [] } = await context.params
  const targetPath = path.join('/')
  const targetUrl = new URL(`${baseUrl}/${targetPath}${request.nextUrl.search}`)

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('content-length')

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  const response = await fetch(targetUrl, init)
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete('content-encoding')
  responseHeaders.delete('transfer-encoding')

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  })
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
export const OPTIONS = proxy
