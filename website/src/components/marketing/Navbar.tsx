'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, ChevronDown, Library, Menu, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { AriaLogo } from '@/components/shared/AriaLogo'

const navItems = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/pricing', match: '/pricing' },
  { label: 'Docs', href: '/docs', match: '/docs' },
]

const resourceItems = [
  {
    label: 'Blog',
    href: '/blog',
    icon: BookOpen,
    description: 'Insights on AI safety, red-teaming, and evaluation',
  },
  {
    label: 'Videos',
    href: '/videos',
    icon: Play,
    description: 'Curated talks, tutorials, and deep-dives',
  },
  {
    label: 'Industry Standards',
    href: '/blog#standards',
    icon: Library,
    description: 'OWASP, NIST AI RMF, MITRE ATLAS, EU AI Act',
  },
]

export function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false)
  const resourcesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(event.target as Node)) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on route change
  useEffect(() => {
    setResourcesOpen(false)
    setMobileOpen(false)
  }, [pathname])

  const isActive = (href: string, match?: string) => {
    if (href === '/') return pathname === '/'
    if (!match) return false
    return pathname.startsWith(match)
  }

  const isResourcesActive = resourceItems.some((item) => pathname.startsWith(item.href.split('#')[0]) && item.href !== '/')

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/90 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur-xl">
      <div className="max-w-8xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3">
          <AriaLogo />
          <span className="text-base font-bold text-white sm:text-lg">ARIA Evaluator</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'rounded-full px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white',
                isActive(item.href, item.match) && 'bg-white/12 text-white ring-1 ring-white/15',
              )}
            >
              {item.label}
            </Link>
          ))}

          {/* Resources dropdown */}
          <div ref={resourcesRef} className="relative">
            <button
              type="button"
              aria-expanded={resourcesOpen}
              aria-haspopup="true"
              onClick={() => setResourcesOpen((open) => !open)}
              className={cn(
                'flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white',
                (isResourcesActive || resourcesOpen) && 'bg-white/12 text-white ring-1 ring-white/15',
              )}
            >
              Resources
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', resourcesOpen && 'rotate-180')}
              />
            </button>

            {resourcesOpen ? (
              <div className="absolute left-1/2 top-full mt-2 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-900/95 p-2 shadow-[0_24px_60px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                {/* Arrow */}
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-900/95" />
                {resourceItems.map((item) => {
                  const Icon = item.icon
                  const active = pathname.startsWith(item.href.split('#')[0]) && item.href !== '/'
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setResourcesOpen(false)}
                      className={cn(
                        'flex items-start gap-3 rounded-xl px-3 py-3 transition hover:bg-white/8',
                        active && 'bg-white/8',
                      )}
                    >
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                        <Icon className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{item.label}</p>
                        <p className="mt-0.5 text-xs leading-4 text-slate-400">{item.description}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link href="/sign-in" className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
            Sign in
          </Link>
          <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
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

            {/* Mobile Resources expandable */}
            <button
              type="button"
              aria-expanded={mobileResourcesOpen}
              onClick={() => setMobileResourcesOpen((open) => !open)}
              className={cn(
                'flex items-center justify-between rounded-full px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white',
                isResourcesActive && 'text-white',
              )}
            >
              Resources
              <ChevronDown
                className={cn('h-4 w-4 transition-transform duration-200', mobileResourcesOpen && 'rotate-180')}
              />
            </button>

            {mobileResourcesOpen ? (
              <div className="ml-3 flex flex-col gap-1 border-l border-white/10 pl-3">
                {resourceItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                    >
                      <Icon className="h-4 w-4 text-cyan-400" />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            ) : null}

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
