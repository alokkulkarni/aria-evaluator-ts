import { auth } from '@/auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Use the canonical public URL for all server-side redirects so the browser
// never sees an internal ECS / container hostname in the Location header.
function canonicalUrl(path: string): URL {
  const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL
  if (base) return new URL(path, base)
  // Local dev fallback — no public URL configured yet
  return new URL(path, 'http://localhost:3000')
}

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname, searchParams } = req.nextUrl
  const isDashboard = pathname.startsWith('/dashboard')
  const launchPath = '/api/launch-instance'

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(canonicalUrl('/sign-in?return=' + encodeURIComponent(launchPath)))
  }

  // Bounce logged-in users off the bare auth forms only. The post-login sign-up
  // wizard steps (e.g. /sign-up?step=plan) are a legitimate destination that
  // /api/launch-instance itself redirects into when a user has no tenant yet —
  // bouncing those would create an infinite redirect loop.
  const isAuthForm =
    pathname === '/sign-in' || (pathname === '/sign-up' && !searchParams.has('step'))
  if (isLoggedIn && isAuthForm) {
    return NextResponse.redirect(canonicalUrl(launchPath))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
