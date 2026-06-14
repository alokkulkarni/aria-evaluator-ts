import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { Metadata } from 'next'

import { BLOG_POSTS, CATEGORY_META } from '@/lib/blog-data'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) return {}
  return {
    title: `${post.title} — ARIA Evaluator Blog`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const post = BLOG_POSTS.find((p) => p.slug === slug)
  if (!post) notFound()

  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug && p.category === post.category).slice(0, 2)

  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
        {/* Article */}
        <article className="min-w-0">
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-slate-500">
            <Link href="/blog" className="transition-colors hover:text-cyan-300">Blog</Link>
            <ChevronRight className="h-3.5 w-3.5 text-slate-600" />
            <span className="truncate text-slate-400">{post.title}</span>
          </nav>

          <header className="mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                {CATEGORY_META[post.category].label}
              </span>
              <span className="text-xs text-slate-500">{post.readTime} min read</span>
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight text-white md:text-4xl">{post.title}</h1>
            <p className="text-lg leading-7 text-slate-400">{post.excerpt}</p>
            <div className="flex items-center gap-3 pt-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-700 text-sm font-bold text-white">
                {post.author.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{post.author.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{post.author.role}</span>
                  <span>·</span>
                  <time>{new Date(post.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                </div>
              </div>
            </div>
          </header>

          <div className="article-prose" dangerouslySetInnerHTML={{ __html: post.content }} />

          {post.references.length > 0 && (
            <section className="mt-10 border-t border-white/10 pt-8">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-300">References</h2>
              <ol className="space-y-2">
                {post.references.map((ref, i) => (
                  <li key={i} className="flex gap-2.5 text-xs leading-5 text-slate-500">
                    <span className="shrink-0 font-medium text-slate-300">[{i + 1}]</span>
                    <span>
                      {ref.url ? (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-cyan-300">
                          {ref.citation}
                        </a>
                      ) : (
                        ref.citation
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-6">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-400">
                #{tag}
              </span>
            ))}
          </div>
        </article>

        {/* Sidebar */}
        <aside className="mt-12 space-y-6 lg:mt-0">
          <div className="glass-strong space-y-3 rounded-2xl p-5">
            <p className="eyebrow">ARIA Evaluator</p>
            <h3 className="font-display text-base font-bold leading-snug text-white">Evaluate your AI agent with confidence</h3>
            <p className="text-sm leading-6 text-slate-400">
              Spin up your own isolated evaluation environment in minutes. Multi-model judging, adversarial
              red-teaming, and full observability included.
            </p>
            <Link
              href="/sign-up"
              className="inline-block w-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-2 text-center text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Start for free
            </Link>
          </div>

          {related.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Related articles</p>
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group glass block space-y-1.5 rounded-2xl p-4 transition hover:border-cyan-300/30">
                  <span className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-cyan-200">
                    {CATEGORY_META[p.category].label}
                  </span>
                  <h4 className="font-display text-sm font-semibold leading-snug text-white transition-colors group-hover:text-cyan-300">
                    {p.title}
                  </h4>
                  <p className="text-xs text-slate-500">{p.readTime} min read</p>
                </Link>
              ))}
            </div>
          )}

          <Link href="/blog" className="flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-cyan-300">
            <ArrowLeft className="h-4 w-4" />
            Back to all articles
          </Link>
        </aside>
      </div>
    </div>
  )
}
