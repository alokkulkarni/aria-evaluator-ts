'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowUpRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { docsNav } from '@/lib/docs-nav'

export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  // Normalize so the active check matches whether the static export is served
  // with clean URLs (/docs/x) or a .html extension (/docs/x.html).
  const pathname = (usePathname() || '').replace(/\.html$/, '').replace(/\/+$/, '') || '/'

  return (
    <nav className="space-y-6">
      {docsNav.map((group) => (
        <div key={group.title}>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{group.title}</p>
          <ul className="mt-2 border-l border-white/10">
            {group.items.map((item) => {
              const active = !item.external && pathname === item.href
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    {...(item.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      '-ml-px flex items-center gap-1 border-l py-1.5 pl-3 text-sm transition',
                      active
                        ? 'border-cyan-300 font-medium text-white'
                        : 'border-transparent text-slate-400 hover:border-cyan-300/50 hover:text-white',
                    )}
                  >
                    {item.label}
                    {item.external ? <ArrowUpRight className="h-3 w-3 opacity-50" /> : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
