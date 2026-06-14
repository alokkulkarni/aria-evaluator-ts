'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { BookOpen, ChevronDown, LayoutDashboard, Library, LogOut, Menu, Play, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { AriaLogo } from '@/components/shared/AriaLogo'

function getInitials(name?: string | null, email?: string | null): string {
  const source = (name?.trim() || email?.split('@')[0] || '').trim()
  if (!source) return 'U'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function UserMenu({ name, email, image }: { name?: string | null; email?: string | null; image?: string | null }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initials = getInitials(name, email)
  const display = name?.trim() || email || 'Account'

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1.5 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/10 hover:text-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300/30 to-blue-400/20 text-xs font-semibold text-cyan-200 ring-1 ring-cyan-300/20">
            {initials}
          </span>
        )}
        <span className="hidden max-w-[10rem] truncate lg:inline">{display}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl"
        >
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-medium text-white">{name || 'Signed in'}</p>
            {email ? <p className="mt-0.5 truncate text-xs text-slate-400">{email}</p> : null}
          </div>
          <Link
            href="/dashboard"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/5 hover:text-white"
          >
            <LayoutDashboard className="h-4 w-4 text-cyan-400" />
            Go to dashboard
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); signOut({ callbackUrl: '/' }) }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4 text-rose-400" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  )
}

const navItems = [
  { label: 'Home', href: '/', match: '/' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/pricing', match: '/pricing' },
  { label: 'Community', href: '/community', match: '/community' },
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
  const { data: session, status: sessionStatus } = useSession()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [resourcesOpen, setResourcesOpen] = useState(false)
  const [mobileResourcesOpen, setMobileResourcesOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const resourcesRef = useRef<HTMLDivElement>(null)

  const isAuthenticated = sessionStatus === 'authenticated'
  const isSessionLoading = sessionStatus === 'loading'

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (resourcesRef.current && !resourcesRef.current.contains(event.target as Node)) {
        setResourcesOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
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
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        scrolled
          ? 'border-b border-white/10 bg-slate-950/80 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.8)] backdrop-blur-xl'
          : 'border-b border-transparent bg-slate-950/30 backdrop-blur-md',
      )}
    >
      {/* hairline cyan accent that intensifies on scroll */}
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent transition-opacity duration-300',
          scrolled ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div className="max-w-8xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="group flex items-center gap-3">
          <span className="relative">
            <span className="absolute -inset-1 rounded-xl bg-cyan-400/20 opacity-0 blur transition-opacity duration-300 group-hover:opacity-100" />
            <AriaLogo className="relative h-8 w-8" />
          </span>
          <span className="text-base font-bold text-white sm:text-lg">ARIA Evaluator</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'group relative rounded-full px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:text-white',
                isActive(item.href, item.match) && 'text-white',
              )}
            >
              <span
                className={cn(
                  'absolute inset-0 rounded-full bg-white/10 opacity-0 ring-1 ring-white/10 transition-opacity duration-200 group-hover:opacity-100',
                  isActive(item.href, item.match) && 'opacity-100',
                )}
              />
              <span className="relative">{item.label}</span>
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
                (isResourcesActive || resourcesOpen) && 'bg-white/10 text-white ring-1 ring-white/10',
              )}
            >
              Resources
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform duration-200', resourcesOpen && 'rotate-180')}
              />
            </button>

            {resourcesOpen ? (
              <div className="absolute left-1/2 top-full mt-2 w-72 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/95 p-2 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-b-slate-950/95" />
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
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-300/20 to-blue-400/10 ring-1 ring-white/10">
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
          {isSessionLoading ? (
            <div className="h-9 w-32 animate-pulse rounded-full bg-white/5" />
          ) : isAuthenticated ? (
            <UserMenu
              name={session?.user?.name}
              email={session?.user?.email}
              image={session?.user?.image}
            />
          ) : (
            <>
              <Link href="/sign-in" className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:border-white/25 hover:bg-white/10 hover:text-white">
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="group relative overflow-hidden rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-1.5 text-sm font-semibold text-slate-950 shadow-[0_8px_24px_-8px_rgba(34,211,238,0.7)] transition hover:brightness-110"
              >
                <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                <span className="relative">Get Started</span>
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          aria-label="Toggle navigation"
          className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 p-2 text-slate-200 md:hidden"
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur-xl md:hidden">
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
              {isSessionLoading ? (
                <div className="h-9 animate-pulse rounded-full bg-white/5" />
              ) : isAuthenticated ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                    {session?.user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={session.user.image} alt="" className="h-8 w-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-400/20 text-xs font-semibold text-cyan-200">
                        {getInitials(session?.user?.name, session?.user?.email)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{session?.user?.name || 'Signed in'}</p>
                      {session?.user?.email ? <p className="truncate text-xs text-slate-400">{session.user.email}</p> : null}
                    </div>
                  </div>
                  <Link
                    href="/dashboard"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-center text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                  >
                    <LayoutDashboard className="h-4 w-4 text-cyan-400" />
                    Go to dashboard
                  </Link>
                  <button
                    type="button"
                    onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }) }}
                    className="flex items-center justify-center gap-2 rounded-full border border-white/10 px-3.5 py-2 text-center text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                  >
                    <LogOut className="h-4 w-4 text-rose-400" />
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/sign-in"
                    className="rounded-full border border-white/10 px-3.5 py-2 text-center text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
                    onClick={() => setMobileOpen(false)}
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/sign-up"
                    className="rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-3.5 py-2 text-center text-sm font-semibold text-slate-950 hover:brightness-110"
                    onClick={() => setMobileOpen(false)}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
