'use client'

import { useState } from 'react'
import { ExternalLink, Play } from 'lucide-react'

import { VIDEO_CATEGORY_META, VIDEOS } from '@/lib/video-data'
import type { VideoCategory } from '@/lib/video-data'
import { cn } from '@/lib/utils'
import { CtaBand, PageHeader, Section } from '@/components/marketing/ui'

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
    <article className="glass group flex flex-col overflow-hidden rounded-2xl p-0 transition hover:border-cyan-300/30">
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
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            const target = e.currentTarget as HTMLImageElement
            target.style.display = 'none'
            const placeholder = target.nextElementSibling as HTMLElement | null
            if (placeholder) placeholder.style.display = 'flex'
          }}
        />
        <div className="absolute inset-0 hidden items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950" aria-hidden="true">
          <Play className="h-12 w-12 text-white/30" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.6)]">
            <Play className="ml-0.5 h-6 w-6 fill-slate-950 text-slate-950" />
          </div>
        </div>
        <span className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {video.durationLabel}
        </span>
      </a>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-cyan-200">
            {meta.label}
          </span>
          <a
            href={video.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-xs text-slate-500 transition hover:text-cyan-300"
          >
            {video.channel}
          </a>
        </div>

        <a href={watchUrl} target="_blank" rel="noopener noreferrer" className="group/title">
          <h3 className="font-display text-sm font-semibold leading-snug text-white transition group-hover/title:text-cyan-300">
            {video.title}
          </h3>
        </a>

        <p className="flex-1 text-xs leading-5 text-slate-400">{video.description}</p>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {video.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-slate-400">
              #{tag}
            </span>
          ))}
        </div>

        <a
          href={watchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto flex items-center gap-1.5 text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
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
    <div>
      <PageHeader
        eyebrow="Videos"
        title="Curated video resources on AI safety and evaluation"
        description="Hand-picked talks, tutorials, and deep-dives from leading researchers covering LLM red-teaming, evaluation methodology, safety alignment, and production observability."
        primary={{ href: '/sign-up', label: 'Get started' }}
        secondary={{ href: '/blog', label: 'Read the blog' }}
      />

      <Section className="pb-6 pt-10">
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setActive(f.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition',
                active === f.value
                  ? 'bg-gradient-to-r from-cyan-300 to-blue-400 text-slate-950 shadow-[0_8px_24px_-10px_rgba(34,211,238,0.7)]'
                  : 'border border-white/10 bg-white/5 text-slate-300 hover:border-white/25 hover:text-white',
              )}
            >
              {f.label}
              <span className="ml-1.5 text-xs opacity-70">
                {f.value === 'all' ? VIDEOS.length : VIDEOS.filter((v) => v.category === f.value).length}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((video) => (
            <VideoCard key={video.youtubeId} video={video} />
          ))}
        </div>
        {filtered.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-500">No videos in this category yet.</p>
        ) : null}
      </Section>

      <CtaBand
        eyebrow="Learn by doing"
        title="Put these evaluation techniques into practice"
        description="ARIA gives you the infrastructure to run structured red-team programmes, multi-model judge pipelines, and continuous evaluation with full observability — everything the videos recommend."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/pricing', label: 'Compare plans' }}
      />
    </div>
  )
}
