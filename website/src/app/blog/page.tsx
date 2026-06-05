import Link from 'next/link'
import { BLOG_POSTS, CATEGORY_META, EXTERNAL_RESOURCES } from '@/lib/blog-data'
import { BlogFilterClient } from './BlogFilterClient'

export const metadata = {
  title: 'Blog — ARIA Evaluator',
  description:
    'Insights on AI evaluation, red-teaming, observability, and platform delivery for enterprise teams.',
}

export default function BlogPage() {
  const [featured, ...rest] = BLOG_POSTS

  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-16">

      {/* ── Hero ── */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Blog</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">Insights on AI safety, evaluation, and platform delivery</h1>
            <p className="page-hero-sub max-w-2xl">
              Read how enterprise teams are approaching red-teaming, evaluation observability, and multi-model
              operations in fast-moving AI environments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/sign-up" className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Get started
            </Link>
            <Link href="/pricing" className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ── Topic overviews ── */}
      <section className="grid gap-5 md:grid-cols-3">
        {[
          { title: 'Platform engineering', description: 'Patterns for bringing repeatable governance and deployment controls into AI delivery workflows.' },
          { title: 'Red-team programs', description: 'Approaches for structuring adversarial scenarios and measuring model resilience over time.' },
          { title: 'Observability practices', description: 'Lessons from teams instrumenting AI evaluations with actionable metrics and trace data.' },
        ].map((item) => (
          <article key={item.title} className="card space-y-2">
            <p className="section-label">Overview</p>
            <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
            <p className="text-sm leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>

      {/* ── Featured post ── */}
      <section>
        <p className="section-label mb-4 text-slate-500">Featured article</p>
        <Link href={`/blog/${featured.slug}`} className="group block">
          <article className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 p-8 md:p-10 shadow-[0_12px_30px_rgba(15,23,42,0.14)] hover:shadow-[0_16px_40px_rgba(15,23,42,0.22)] transition-shadow">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_META[featured.category].badge}`}>
                {CATEGORY_META[featured.category].label}
              </span>
              <span className="text-slate-400 text-xs">{featured.readTime} min read</span>
              <span className="text-slate-400 text-xs">·</span>
              <time className="text-slate-400 text-xs">{new Date(featured.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-snug group-hover:text-cyan-300 transition-colors mb-3">
              {featured.title}
            </h2>
            <p className="text-slate-300 leading-7 max-w-3xl mb-6">{featured.excerpt}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                  {featured.author.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{featured.author.name}</p>
                  <p className="text-xs text-slate-400">{featured.author.role}</p>
                </div>
              </div>
              <span className="text-cyan-400 text-sm font-medium group-hover:translate-x-1 transition-transform inline-block">
                Read article →
              </span>
            </div>
          </article>
        </Link>
      </section>

      {/* ── All posts with filter ── */}
      <section>
        <BlogFilterClient posts={rest} />
      </section>

      {/* ── Resources ── */}
      <section>
        <div className="mb-6">
          <p className="section-label mb-1 text-slate-500">External resources</p>
          <h2 className="text-2xl font-bold text-slate-900">Industry standards &amp; references</h2>
          <p className="text-slate-500 text-sm mt-1">Authoritative frameworks, standards, and research cited across our articles.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {EXTERNAL_RESOURCES.map((res) => (
            <a
              key={res.title}
              href={res.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card group hover:border-blue-300/60 hover:shadow-[0_12px_30px_rgba(15,23,42,0.1)] transition-all space-y-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${res.badgeClass}`}>
                  {res.category}
                </span>
                <svg className="h-4 w-4 text-slate-400 group-hover:text-blue-500 transition-colors mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                {res.title}
              </h3>
              <p className="text-xs text-slate-500 leading-5">{res.description}</p>
            </a>
          ))}
        </div>
      </section>

    </div>
  )
}
