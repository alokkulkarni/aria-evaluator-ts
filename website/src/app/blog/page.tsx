import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'

import { BLOG_POSTS, CATEGORY_META, EXTERNAL_RESOURCES } from '@/lib/blog-data'
import { PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'
import { BlogFilterClient } from './BlogFilterClient'

export const metadata = {
  title: 'Blog — ARIA Evaluator',
  description:
    'Insights on AI evaluation, red-teaming, observability, and platform delivery for enterprise teams.',
}

const topics = [
  { title: 'Platform engineering', description: 'Patterns for bringing repeatable governance and deployment controls into AI delivery workflows.' },
  { title: 'Red-team programs', description: 'Approaches for structuring adversarial scenarios and measuring model resilience over time.' },
  { title: 'Observability practices', description: 'Lessons from teams instrumenting AI evaluations with actionable metrics and trace data.' },
]

export default function BlogPage() {
  const [featured, ...rest] = BLOG_POSTS

  return (
    <div>
      <PageHeader
        eyebrow="Blog"
        title="Insights on AI safety, evaluation, and platform delivery"
        description="Read how enterprise teams are approaching red-teaming, evaluation observability, and multi-model operations in fast-moving AI environments."
        primary={{ href: '/sign-up', label: 'Get started' }}
        secondary={{ href: '/pricing', label: 'View pricing' }}
      />

      {/* Topic overviews */}
      <Section className="py-12">
        <Reveal stagger={0.08} className="grid gap-5 md:grid-cols-3">
          {topics.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-6">
              <p className="eyebrow">Overview</p>
              <h2 className="font-display text-xl font-semibold text-white">{item.title}</h2>
              <p className="text-sm leading-6 text-slate-400">{item.description}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Featured post */}
      <Section className="py-4">
        <p className="eyebrow mb-4">Featured article</p>
        <Reveal>
          <Link href={`/blog/${featured.slug}`} className="group block">
            <article className="ring-conic glass-strong relative overflow-hidden p-8 md:p-10">
              <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {CATEGORY_META[featured.category].label}
                  </span>
                  <span className="text-xs text-slate-500">{featured.readTime} min read</span>
                  <span className="text-xs text-slate-600">·</span>
                  <time className="text-xs text-slate-500">
                    {new Date(featured.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </time>
                </div>
                <h2 className="mb-3 font-display text-2xl font-bold leading-snug text-white transition-colors group-hover:text-cyan-300 md:text-3xl">
                  {featured.title}
                </h2>
                <p className="mb-6 max-w-3xl leading-7 text-slate-400">{featured.excerpt}</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-xs font-bold text-white">
                      {featured.author.name.split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{featured.author.name}</p>
                      <p className="text-xs text-slate-500">{featured.author.role}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-cyan-300 transition-transform group-hover:translate-x-1">
                    Read article <ArrowUpRight className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </article>
          </Link>
        </Reveal>
      </Section>

      {/* All posts with filter */}
      <Section className="py-8">
        <BlogFilterClient posts={rest} />
      </Section>

      {/* Resources */}
      <Section id="standards" className="py-12">
        <SectionHeading
          eyebrow="External resources"
          title="Industry standards & references"
          subtitle="Authoritative frameworks, standards, and research cited across our articles."
        />
        <Reveal stagger={0.06} className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {EXTERNAL_RESOURCES.map((res) => (
            <a
              key={res.title}
              href={res.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group space-y-2.5 rounded-2xl p-5 transition hover:border-cyan-300/30"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-slate-300">
                  {res.category}
                </span>
                <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-cyan-300" />
              </div>
              <h3 className="font-display text-sm font-semibold leading-snug text-white transition-colors group-hover:text-cyan-300">
                {res.title}
              </h3>
              <p className="text-xs leading-5 text-slate-400">{res.description}</p>
            </a>
          ))}
        </Reveal>
      </Section>
    </div>
  )
}
