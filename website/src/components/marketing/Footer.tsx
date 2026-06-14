import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { AriaLogo } from '@/components/shared/AriaLogo'
import { MagneticButton } from '@/components/motion/MagneticButton'

const footerGroups = {
  Product: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/security' },
    { label: 'Docs', href: '/docs' },
    { label: 'Community', href: '/community' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'Blog', href: '/blog' },
    { label: 'Careers', href: '/careers' },
    { label: 'Contact', href: '/contact' },
  ],
  Legal: [
    { label: 'Privacy', href: '/privacy' },
    { label: 'Terms', href: '/terms' },
    { label: 'Cookie Policy', href: '/cookies' },
  ],
}

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

      {/* CTA band */}
      <div className="max-w-8xl mx-auto px-4 pt-16 sm:px-6 lg:px-8">
        <div className="glass relative overflow-hidden rounded-[1.75rem] px-6 py-10 sm:px-10">
          <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl space-y-3">
              <p className="eyebrow">Ready when you are</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Ship safer AI, with evidence to prove it.
              </h2>
              <p className="text-sm leading-6 text-slate-400">
                Spin up a dedicated evaluation workspace, pick your region, and run your first
                15-dimension judge in minutes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <MagneticButton
                href="/sign-up"
                className="items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_40px_-12px_rgba(34,211,238,0.7)] transition hover:brightness-110"
              >
                Start for free
              </MagneticButton>
              <Link
                href="/contact"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
              >
                Talk to sales <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Link columns */}
      <div className="max-w-8xl mx-auto px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AriaLogo />
              <span className="text-sm font-bold text-white">ARIA Evaluator</span>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-400">
              Safe, observable, and globally deployable AI evaluation infrastructure for security,
              product, and platform teams.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="relative h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-xs text-slate-400">All systems operational</span>
            </div>
          </div>

          {Object.entries(footerGroups).map(([title, links]) => (
            <div key={title} className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</h3>
              <ul className="space-y-3 text-sm">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="group inline-flex items-center gap-1 text-slate-400 transition hover:text-white"
                    >
                      {link.label}
                      <ArrowUpRight className="h-3 w-3 opacity-0 -translate-x-1 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 ARIA Evaluator, Inc.</p>
          <p>Built for enterprise AI safety</p>
        </div>
      </div>

      {/* Giant fading wordmark */}
      <div
        aria-hidden
        className="pointer-events-none select-none px-4 pb-2 text-center font-display text-[18vw] font-bold leading-none tracking-tighter text-white/[0.025] sm:text-[14vw]"
      >
        ARIA
      </div>
    </footer>
  )
}
