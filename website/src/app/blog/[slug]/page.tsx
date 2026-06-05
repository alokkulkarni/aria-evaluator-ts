import { notFound } from 'next/navigation'
import Link from 'next/link'
import { BLOG_POSTS, CATEGORY_META } from '@/lib/blog-data'
import type { Metadata } from 'next'

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

  const related = BLOG_POSTS.filter(
    (p) => p.slug !== post.slug && p.category === post.category,
  ).slice(0, 2)

  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">

        {/* ── Article ── */}
        <article className="min-w-0">

          {/* Breadcrumb */}
          <nav className="mb-6 flex items-center gap-1.5 text-sm text-slate-500">
            <Link href="/blog" className="hover:text-blue-600 transition-colors">Blog</Link>
            <svg className="h-3.5 w-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
            </svg>
            <span className="truncate">{post.title}</span>
          </nav>

          {/* Header */}
          <header className="mb-8 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_META[post.category].badge}`}>
                {CATEGORY_META[post.category].label}
              </span>
              <span className="text-slate-400 text-xs">{post.readTime} min read</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight">
              {post.title}
            </h1>
            <p className="text-lg text-slate-500 leading-7">{post.excerpt}</p>
            <div className="flex items-center gap-3 pt-1">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-700 flex items-center justify-center text-white text-sm font-bold">
                {post.author.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{post.author.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>{post.author.role}</span>
                  <span>·</span>
                  <time>{new Date(post.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                </div>
              </div>
            </div>
          </header>

          {/* Content */}
          <div
            className="article-prose"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />

          {/* References */}
          {post.references.length > 0 && (
            <section className="mt-10 pt-8 border-t border-slate-200">
              <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">References</h2>
              <ol className="space-y-2">
                {post.references.map((ref, i) => (
                  <li key={i} className="flex gap-2.5 text-xs text-slate-500 leading-5">
                    <span className="shrink-0 font-medium text-slate-700">[{i + 1}]</span>
                    <span>
                      {ref.url ? (
                        <a href={ref.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
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

          {/* Tags */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600 font-medium">
                #{tag}
              </span>
            ))}
          </div>
        </article>

        {/* ── Sidebar ── */}
        <aside className="mt-12 lg:mt-0 space-y-6">

          {/* CTA */}
          <div className="card bg-gradient-to-br from-slate-950 to-blue-950 border-slate-800 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-400">ARIA Evaluator</p>
            <h3 className="text-base font-bold text-white leading-snug">Evaluate your AI agent with confidence</h3>
            <p className="text-sm text-slate-300 leading-6">
              Spin up your own isolated evaluation environment in minutes. Multi-model judging, adversarial red-teaming, and full observability included.
            </p>
            <Link href="/sign-up" className="inline-block w-full text-center rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 transition-colors">
              Start for free
            </Link>
          </div>

          {/* Related posts */}
          {related.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Related articles</p>
              {related.map((p) => (
                <Link key={p.slug} href={`/blog/${p.slug}`} className="group block card space-y-1.5 hover:border-blue-300/60 transition-all">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_META[p.category].badge}`}>
                    {CATEGORY_META[p.category].label}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors leading-snug">
                    {p.title}
                  </h4>
                  <p className="text-xs text-slate-400">{p.readTime} min read</p>
                </Link>
              ))}
            </div>
          )}

          {/* Back link */}
          <Link href="/blog" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-blue-600 transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            Back to all articles
          </Link>
        </aside>

      </div>
    </div>
  )
}
