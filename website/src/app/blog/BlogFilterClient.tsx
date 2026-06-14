'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BlogPost, BlogCategory } from '@/lib/blog-data'
import { CATEGORY_META } from '@/lib/blog-data'
import { cn } from '@/lib/utils'

const ALL_CATEGORIES: Array<{ value: BlogCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All articles' },
  { value: 'platform-engineering', label: 'Platform Engineering' },
  { value: 'red-team', label: 'Red-Team' },
  { value: 'observability', label: 'Observability' },
  { value: 'research', label: 'Research' },
]

export function BlogFilterClient({ posts }: { posts: BlogPost[] }) {
  const [active, setActive] = useState<BlogCategory | 'all'>('all')

  const filtered = active === 'all' ? posts : posts.filter((p) => p.category === active)

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-2">
        {ALL_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActive(cat.value)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition',
              active === cat.value
                ? 'bg-gradient-to-r from-cyan-300 to-blue-400 text-slate-950 shadow-[0_8px_24px_-10px_rgba(34,211,238,0.7)]'
                : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white',
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Post grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
            <article className="glass flex h-full flex-col space-y-3 rounded-2xl p-5 transition hover:border-cyan-300/30">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                  {CATEGORY_META[post.category].label}
                </span>
                <span className="text-xs text-slate-500">{post.readTime} min read</span>
              </div>

              <h2 className="font-display text-base font-semibold leading-snug text-white transition-colors group-hover:text-cyan-300">
                {post.title}
              </h2>

              <p className="flex-1 text-sm leading-6 text-slate-400">{post.excerpt}</p>

              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-slate-600 text-[10px] font-bold text-white">
                    {post.author.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-200">{post.author.name}</p>
                    <time className="text-[10px] text-slate-500">
                      {new Date(post.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </time>
                  </div>
                </div>
                <span className="text-xs font-medium text-cyan-300 transition-transform group-hover:translate-x-0.5">
                  Read →
                </span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  )
}
