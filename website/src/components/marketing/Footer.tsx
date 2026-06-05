import Link from 'next/link'

import { AriaLogo } from '@/components/shared/AriaLogo'

const footerGroups = {
  Product: [
    { label: 'Features', href: '/#features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/security' },
    { label: 'Docs', href: '/docs' },
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
    <footer className="bg-slate-950 text-slate-400">
      <div className="max-w-8xl mx-auto px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AriaLogo />
              <span className="text-sm font-bold text-white">ARIA Evaluator</span>
            </div>
            <p className="max-w-sm text-sm leading-6 text-slate-400">
              Safe, observable, and globally deployable AI evaluation infrastructure for security, product, and platform teams.
            </p>
          </div>

          {Object.entries(footerGroups).map(([title, links]) => (
            <div key={title} className="space-y-4">
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <ul className="space-y-3 text-sm">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className="transition hover:text-white">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-white/10 pt-6 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>© 2025 ARIA Evaluator, Inc.</p>
          <p>Built for enterprise AI safety</p>
        </div>
      </div>
    </footer>
  )
}
