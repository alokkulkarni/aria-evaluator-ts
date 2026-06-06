import { auth } from '@/auth'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard')
  const launchPath = '/api/launch-instance'

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL('/sign-in?return=' + encodeURIComponent(launchPath), req.url))
  }

  if (isLoggedIn && (req.nextUrl.pathname === '/sign-in' || req.nextUrl.pathname === '/sign-up')) {
    return NextResponse.redirect(new URL(launchPath, req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
