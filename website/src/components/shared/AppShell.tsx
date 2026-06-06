'use client'

import { Footer } from '@/components/marketing/Footer'
import { Navbar } from '@/components/marketing/Navbar'
import { usePathname } from 'next/navigation'

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isDashboard = pathname.startsWith('/dashboard')
  const showNavbar = !isDashboard
  const showFooter = !isDashboard && pathname !== '/sign-in' && pathname !== '/sign-up'

  return (
    <div className="min-h-screen">
      {showNavbar ? <Navbar /> : null}
      <main className="min-h-[calc(100vh-4rem)]">{children}</main>
      {showFooter ? <Footer /> : null}
    </div>
  )
}
