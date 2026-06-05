'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'

import { VIDEO_CATEGORY_META, VIDEOS } from '@/lib/video-data'
import type { VideoCategory } from '@/lib/video-data'
import { cn } from '@/lib/utils'

const ALL = 'all' as const
type FilterValue = typeof ALL | VideoCategory

const filters: { value: FilterValue; label: string }[] = [
  { value: 'all', label: 'All videos' },
  { value: 'education', label: 'Education' },
  { value: 'safety-red-team', label: 'Safety & Red-Team' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'observability', label: 'Observability' },
]

function VideoCard({ video }: { video: (typeof VIDEOS)[number] }) {
  const meta = VIDEO_CATEGORY_META[video.category]
  const thumbnailUrl = `https://img.youtube.com/vi/${video.youtubeId}/maxresdefault.jpg`
  const watchUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

  return (
    <article className="card group flex flex-col gap-0 overflow-hidden p-0">
      {/* Thumbnail */}
      <a
        href={watchUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Watch ${video.title} on YouTube`}
        className="relative block aspect-video w-full overflow-hidden bg-slate-900"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const placeholder = target.nextElementSibling as HTMLElement | null
            if (placeholder) placeholder.style.display = 'flex'
          }}
        />
        {/* Gradient placeholder shown on thumbnail error */}
        <div
          className="absolute inset-0 hidden items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950"
          aria-hidden="true"
        >
          <Play className="h-12 w-12 text-white/30" />
        </div>
        {/* Play overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg">
            <Play className="ml-0.5 h-6 w-6 fill-slate-900 text-slate-900" />
          </div>
        </div>
        {/* Duration badge */}
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {video.durationLabel}
        </span>
      </a>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', meta.badge)}>
            {meta.label}
          </span>
          <a
            href={video.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-slate-400 transition hover:text-blue-600"
          >
            {video.channel}
          </a>
        </div>

        <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="group/title">
          <h3 className="text-sm font-semibold leading-snug text-slate-900 transition group-hover/title:text-blue-700">
            {video.title}
          </h3>
        </a>

        <p className="flex-1 text-xs leading-5 text-slate-500">{video.description}</p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {video.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
              #{tag}
            </span>
          ))}
        </div>

        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition hover:text-blue-800"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Watch on YouTube
        </a>
      </div>
    </article>
  )
}

export default function VideosPage() {
  const [active, setActive] = useState<FilterValue>('all')

  const filtered = active === 'all' ? VIDEOS : VIDEOS.filter((v) => v.category === active)

  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-12">

      {/* ── Hero ── */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Videos</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">Curated video resources on AI safety and evaluation</h1>
            <p className="page-hero-sub max-w-2xl">
              Hand-picked talks, tutorials, and deep-dives from leading researchers covering LLM red-teaming,
              evaluation methodology, safety alignment, and production observability.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/sign-up"
              className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Get started
            </Link>
            <Link
              href="/blog"
              className="rounded-full border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Read the blog →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setActive(f.value)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium transition',
              active === f.value
                ? 'bg-slate-900 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {f.label}
            <span className="ml-1.5 text-xs opacity-60">
              {f.value === 'all' ? VIDEOS.length : VIDEOS.filter((v) => v.category === f.value).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Grid ── */}
      <section>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((video) => (
            <VideoCard key={video.youtubeId} video={video} />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">No videos in this category yet.</p>
        ) : null}
      </section>

      {/* ── CTA ── */}
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-10 text-white">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Learn by doing</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Put these evaluation techniques into practice
            </h2>
            <p className="text-sm leading-6 text-slate-200/80">
              ARIA Evaluator gives you the infrastructure to run structured red-team programmes, multi-model judge
              pipelines, and continuous evaluation with full observability — everything the videos recommend.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sign-up"
              className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Start for free
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </section>

    </div>
  )
}
