import { AuroraBackground } from '@/components/marketing/AuroraBackground'
import { Footer } from '@/components/marketing/Footer'
import { Navbar } from '@/components/marketing/Navbar'
import { CookieConsentBanner } from '@/components/shared/CookieConsentBanner'

// Single marketing surface for the open-source site: the elevated dark-tech
// theme scoped to `.marketing-root`. (The old dashboard/auth light shell was
// removed when authentication was dropped.)
export function AppShell({ children }: { children: React.ReactNode }) {
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
