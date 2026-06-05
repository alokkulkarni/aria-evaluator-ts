'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { BlogPost, BlogCategory } from '@/lib/blog-data'
import { CATEGORY_META } from '@/lib/blog-data'

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
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all ${
              active === cat.value
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Post grid */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className="group block">
            <article className="card h-full flex flex-col space-y-3 hover:border-blue-300/60 hover:shadow-[0_12px_30px_rgba(15,23,42,0.1)] transition-all">
              {/* Category + meta */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_META[post.category].badge}`}>
                  {CATEGORY_META[post.category].label}
                </span>
                <span className="text-slate-400 text-xs">{post.readTime} min read</span>
              </div>

              {/* Title */}
              <h2 className="text-base font-semibold text-slate-900 leading-snug group-hover:text-blue-700 transition-colors">
                {post.title}
              </h2>

              {/* Excerpt */}
              <p className="text-sm text-slate-500 leading-6 flex-1">{post.excerpt}</p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-400 to-slate-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                    {post.author.name.split(' ').map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-700">{post.author.name}</p>
                    <time className="text-[10px] text-slate-400">
                      {new Date(post.publishedAt).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </time>
                  </div>
                </div>
                <span className="text-xs text-blue-600 font-medium group-hover:translate-x-0.5 transition-transform inline-block">
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
