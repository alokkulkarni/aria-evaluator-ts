'use client'

import { CreditCard, LayoutDashboard, LogOut, Server, Settings, Users } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

import { cn } from '@/lib/utils'
import { AriaLogo } from '@/components/shared/AriaLogo'

const links = [
  { label: 'Overview', href: '/dashboard', match: '/dashboard', icon: LayoutDashboard },
  { label: 'My Instance', href: '/dashboard#instance', icon: Server },
  { label: 'Users', href: '/dashboard#team', icon: Users },
  { label: 'Billing', href: '/dashboard/billing', match: '/dashboard/billing', icon: CreditCard },
  { label: 'Settings', href: '/dashboard#settings', icon: Settings },
]

interface DashboardNavProps {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
  }
}

export function DashboardNav({ user = {} }: DashboardNavProps) {
  const pathname = usePathname()
  const initials = (user.name ?? user.email ?? 'A')
    .split(' ')
    .map((value) => value[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <>
      <nav className="card mb-4 flex gap-2 overflow-x-auto p-3 lg:hidden">
        {links.map(({ label, href, match, icon: Icon }) => {
          const active = match ? pathname.startsWith(match) : false
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                'inline-flex min-w-fit items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                active && 'bg-slate-950 text-white hover:bg-slate-950 hover:text-white',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <aside className="hidden lg:block">
        <div className="card sticky top-24 flex h-[calc(100vh-8rem)] flex-col justify-between">
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <AriaLogo />
                <span className="text-sm font-bold text-slate-900">ARIA Evaluator</span>
              </div>
              <p className="text-sm text-slate-500">Manage provisioning, usage, and billing from one secure workspace.</p>
            </div>

            <nav className="space-y-2">
              {links.map(({ label, href, match, icon: Icon }) => {
                const active = match ? pathname.startsWith(match) : false
                return (
                  <Link
                    key={label}
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900',
                      active && 'bg-slate-950 text-white hover:bg-slate-950 hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">{initials}</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name ?? 'ARIA user'}</p>
                <p className="truncate text-xs text-slate-500">{user.email ?? 'workspace@ariaeval.io'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="btn-secondary w-full justify-center rounded-xl"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
