'use client'

import { usePathname } from 'next/navigation'

import { AuroraBackground } from '@/components/marketing/AuroraBackground'
import { Footer } from '@/components/marketing/Footer'
import { Navbar } from '@/components/marketing/Navbar'
import { CookieConsentBanner } from '@/components/shared/CookieConsentBanner'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isDashboard = pathname.startsWith('/dashboard')
  const isAuth = ['/sign-in', '/sign-up', '/sign-out'].some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  const isMarketing = !isDashboard && !isAuth

  // Marketing surface: the elevated dark-tech theme. Scoped to `.marketing-root`
  // so the authenticated dashboard and auth flows keep their light styling.
  if (isMarketing) {
    return (
      <div className="marketing-root">
        <AuroraBackground />
        <Navbar />
        <main className="relative min-h-[calc(100vh-4rem)]">{children}</main>
        <Footer />
        <CookieConsentBanner />
      </div>
    )
  }

  // Dashboard + auth keep the existing light shell. Navbar is hidden on the
  // dashboard (it has its own nav) but shown on auth pages.
  return (
    <div className="min-h-screen">
      {!isDashboard ? <Navbar /> : null}
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      <CookieConsentBanner />
    </div>
  )
}
