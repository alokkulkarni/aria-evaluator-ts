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
  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard')
  const launchPath = '/api/launch-instance'

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(canonicalUrl('/sign-in?return=' + encodeURIComponent(launchPath)))
  }

  if (isLoggedIn && (req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname === '/sign-up')) {
    return NextResponse.redirect(canonicalUrl(launchPath))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
