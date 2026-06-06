import { NextResponse } from 'next/server'

import { auth } from '@/auth'
import { serverApiFetch } from '@/lib/api'

export async function GET(request: Request) {
  const session = await auth()
  const authToken = session?.user?.accessToken

  if (!authToken) {
    return NextResponse.redirect(new URL('/sign-in?return=/dashboard', request.url))
  }

  const launch = await serverApiFetch<{ ssoUrl?: string | null; instanceUrl?: string | null }>('/instance/sso-token', {
    method: 'POST',
    authToken,
  })

  const target = launch.ssoUrl ?? launch.instanceUrl
  if (!target) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.redirect(new URL(target))
}
