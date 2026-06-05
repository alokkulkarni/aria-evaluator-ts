import Link from 'next/link'

interface ContentPageProps {
  label: string
  title: string
  description: string
  highlights: Array<{ title: string; description: string }>
  primaryCta?: { href: string; label: string }
  secondaryCta?: { href: string; label: string }
}

export function ContentPage({
  label,
  title,
  description,
  highlights,
  primaryCta = { href: '/sign-up', label: 'Get started' },
  secondaryCta = { href: '/pricing', label: 'View pricing' },
}: ContentPageProps) {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">{label}</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">{title}</h1>
            <p className="page-hero-sub max-w-2xl">{description}</p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={primaryCta.href} className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              {primaryCta.label}
            </Link>
            <Link href={secondaryCta.href} className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              {secondaryCta.label}
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {highlights.map((item) => (
          <article key={item.title} className="card space-y-2">
            <p className="section-label">Overview</p>
            <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
            <p className="text-sm leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}
