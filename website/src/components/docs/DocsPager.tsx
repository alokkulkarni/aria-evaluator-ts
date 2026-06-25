'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { docsOrder } from '@/lib/docs-nav'

/** Prev/next navigation across the docs pages, derived from the sidebar order. */
export function DocsPager() {
  // Normalize so prev/next resolves whether served with clean URLs or .html.
  const pathname = (usePathname() || '').replace(/\.html$/, '').replace(/\/+$/, '') || '/'
  const idx = docsOrder.findIndex((i) => i.href === pathname)
  if (idx === -1) return null

  const prev = idx > 0 ? docsOrder[idx - 1] : null
  const next = idx < docsOrder.length - 1 ? docsOrder[idx + 1] : null
  if (!prev && !next) return null

  return (
    <div className="mt-14 grid gap-3 border-t border-white/10 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition hover:border-cyan-300/30 hover:bg-white/[0.05]"
        >
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <ArrowLeft className="h-3.5 w-3.5" /> Previous
          </span>
          <span className="mt-0.5 text-sm font-medium text-slate-200 group-hover:text-white">{prev.label}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-right transition hover:border-cyan-300/30 hover:bg-white/[0.05] sm:items-end"
        >
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            Next <ArrowRight className="h-3.5 w-3.5" />
          </span>
          <span className="mt-0.5 text-sm font-medium text-slate-200 group-hover:text-white">{next.label}</span>
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}
