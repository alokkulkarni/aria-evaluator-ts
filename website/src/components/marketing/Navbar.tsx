'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'
import { AriaLogo } from '@/components/shared/AriaLogo'

const navItems = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/pricing', match: '/pricing' },
  { label: 'Docs', href: '/docs', match: '/docs' },
]

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string, match?: string) => {
    if (href === '/') return pathname === '/'
    if (!match) return false
    return pathname.startsWith(match)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl">
      <div className="max-w-8xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <AriaLogo />
          <span className="text-sm font-bold text-white sm:text-base">ARIA Evaluator</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/5 hover:text-white',
                isActive(item.href, item.match) && 'bg-white/12 text-white ring-1 ring-white/15',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/sign-in" className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300">
            Get Started
          </Link>
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          className="inline-flex items-center justify-center rounded-full border border-white/10 p-2 text-slate-200 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-slate-950/95 px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'rounded-full px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white',
                  isActive(item.href, item.match) && 'bg-white/12 text-white ring-1 ring-white/15',
                )}
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2">
              <Link
                href="/sign-in"
                className="rounded-full border border-white/10 px-3.5 py-2 text-center text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                onClick={() => setMobileOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="rounded-full bg-cyan-400 px-3.5 py-2 text-center text-sm font-semibold text-slate-950 hover:bg-cyan-300"
                onClick={() => setMobileOpen(false)}
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
