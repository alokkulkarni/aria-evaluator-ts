import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { serverApiFetch } from '@/lib/api'

// Use the canonical public URL for redirects so the browser never sees the
// internal ECS container hostname in the Location header.
function canonicalUrl(path: string): URL {
  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (base) return new URL(path, base)
  return new URL(path, 'http://localhost:3000')
}

export async function GET(request: Request) {
  const session = await auth()
  const authToken = session?.user?.accessToken

  if (!authToken) {
    return NextResponse.redirect(canonicalUrl('/sign-in?return=/api/launch-instance'))
  }

  try {
    const launch = await serverApiFetch<{ ssoUrl?: string | null; instanceUrl?: string | null }>('/instance/sso-token', {
      method: 'POST',
      authToken,
    })

    const target = launch.ssoUrl ?? launch.instanceUrl
    if (!target) {
      return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
    }

    return NextResponse.redirect(new URL(target))
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status: unknown }).status === 'number' &&
      (error as { status: number }).status === 409
    ) {
      return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
    }
    throw error
  }
}
