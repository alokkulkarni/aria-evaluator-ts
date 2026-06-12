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

function statusOf(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status
    if (typeof status === 'number') return status
  }
  return null
}

export async function GET() {
  const session = await auth()
  const authToken = session?.user?.accessToken

  if (!authToken) {
    return NextResponse.redirect(canonicalUrl('/sign-in?return=/api/launch-instance'))
  }

  // Step 1: figure out where the user *should* land based on tenant state,
  // before attempting to mint an SSO token (which only makes sense once the
  // workspace is actually running).
  let tenant: { tenantId: string | null; status: string | null } | null = null
  try {
    tenant = await serverApiFetch<{ tenantId: string | null; status: string | null }>('/tenant/me', { authToken })
  } catch (error) {
    const status = statusOf(error)
    if (status === 404 || status === 409) {
      return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
    }
    // Control-plane unreachable or session invalid — bounce to sign-up rather
    // than 500'ing the browser. The sign-up page can re-establish things.
    return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
  }

  // No tenant yet — they haven't completed the sign-up wizard.
  if (!tenant || !tenant.tenantId) {
    return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
  }

  // Provisioning or errored — show them the live status page, not a broken SSO.
  if (tenant.status === 'provisioning' || tenant.status === 'error') {
    return NextResponse.redirect(canonicalUrl('/sign-up/provisioning'))
  }

  // Suspended — back to the dashboard so they can resume.
  if (tenant.status === 'suspended' || tenant.status === 'suspending') {
    return NextResponse.redirect(canonicalUrl('/dashboard'))
  }

  // Status is 'running' — mint an SSO token and forward to the workspace.
  try {
    const launch = await serverApiFetch<{ ssoUrl?: string | null; instanceUrl?: string | null }>('/instance/sso-token', {
      method: 'POST',
      authToken,
    })

    const target = launch.ssoUrl ?? launch.instanceUrl
    if (!target) return NextResponse.redirect(canonicalUrl('/dashboard'))
    return NextResponse.redirect(new URL(target))
  } catch (error) {
    if (statusOf(error) === 409) {
      return NextResponse.redirect(canonicalUrl('/sign-up?step=plan'))
    }
    // SSO failure on a "running" tenant is a real surprise — dashboard surfaces
    // the issue better than a generic 500.
    return NextResponse.redirect(canonicalUrl('/dashboard'))
  }
}
