import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  MessageSquare,
  Pin,
  Users,
  ExternalLink,
  BookOpen,
  Wrench,
  FileText,
  Newspaper,
} from 'lucide-react'

import { COMMUNITIES, COLOUR_MAP, getCommunityById } from '@/lib/communities'
import { SlackIcon, DiscordIcon, GitHubIcon } from '@/components/shared/BrandIcons'

const platformMeta = {
  slack: { icon: SlackIcon, label: 'Slack', colour: 'bg-[#4A154B] hover:bg-[#3a1140]' },
  discord: { icon: DiscordIcon, label: 'Discord', colour: 'bg-[#5865F2] hover:bg-[#4752c4]' },
  github: { icon: GitHubIcon, label: 'GitHub Discussions', colour: 'bg-slate-800 hover:bg-slate-700' },
} as const

export function generateStaticParams() {
  return COMMUNITIES.map((c) => ({ slug: c.id }))
}

const resourceTypeIcons: Record<string, { icon: typeof BookOpen; label: string }> = {
  guide: { icon: BookOpen, label: 'Guide' },
  standard: { icon: FileText, label: 'Standard' },
  tool: { icon: Wrench, label: 'Tool' },
  article: { icon: Newspaper, label: 'Article' },
}

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const community = getCommunityById(slug)
  if (!community) return notFound()

  const Icon = community.icon
  const colours = COLOUR_MAP[community.colour]

  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      {/* Breadcrumb */}
      <Link
        href="/community"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All communities
      </Link>

      {/* Header */}
      <section className="page-hero mt-2">
        <div className="flex items-start gap-5">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${colours.icon}`}
          >
            <Icon className="h-7 w-7" />
          </div>
          <div className="space-y-3">
            <p className={`text-xs font-semibold uppercase tracking-wider ${colours.accent}`}>
              {community.tagline}
            </p>
            <h1 className="page-hero-title">{community.name}</h1>
            <p className="page-hero-sub max-w-2xl">
              {community.longDescription}
            </p>
            <div className="flex flex-wrap gap-3 pt-1">
              {community.topics.map((topic) => (
                <span
                  key={topic}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${colours.badge}`}
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Two-column layout: Discussions + Sidebar */}
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Discussions */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Discussions</h2>
            <Link
              href="/sign-up"
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${colours.icon}`}
            >
              Start a discussion
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {community.discussions.map((d, i) => (
              <article
                key={i}
                className={`card group flex items-start gap-4 p-4 transition ${colours.card}`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 group-hover:bg-slate-100">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    {d.pinned && (
                      <Pin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${colours.accent}`} />
                    )}
                    <h3 className="text-sm font-medium text-slate-900 group-hover:text-slate-700">
                      {d.title}
                    </h3>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-medium text-slate-600">@{d.author}</span>
                    <span>·</span>
                    <span>{d.replies} replies</span>
                    <span>·</span>
                    <span>{d.date}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Join prompt */}
          <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              Join the conversation
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sign up for a free account to post, reply, and follow discussions.
            </p>
            <Link
              href="/sign-up"
              className="mt-4 inline-flex rounded-full bg-cyan-400 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Sign up free
            </Link>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          {/* Join channels */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">Join on</h3>
            <div className="mt-3 space-y-2">
              {community.channels.map((ch) => {
                const meta = platformMeta[ch.platform]
                const ChannelIcon = meta.icon
                return (
                  <Link
                    key={ch.platform}
                    href={ch.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition ${meta.colour}`}
                  >
                    <ChannelIcon className="h-4 w-4" />
                    <span className="flex-1">{meta.label}</span>
                    <span className="text-xs font-normal opacity-70">{ch.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Community stats */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">About</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {community.description}
            </p>
            <div className={`mt-4 flex items-center gap-2 rounded-lg border p-3 ${colours.border} bg-slate-50/50`}>
              <Users className={`h-4 w-4 ${colours.accent}`} />
              <span className="text-sm font-medium text-slate-700">
                {community.members}
              </span>
            </div>
          </div>

          {/* Resources */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">Resources</h3>
            <div className="mt-3 space-y-3">
              {community.resources.map((r, i) => {
                const typeInfo = resourceTypeIcons[r.type]
                const TypeIcon = typeInfo.icon
                const isExternal = r.href.startsWith('http')
                return (
                  <Link
                    key={i}
                    href={r.href}
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className="group/res block rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50/50"
                  >
                    <div className="flex items-start gap-3">
                      <TypeIcon className={`mt-0.5 h-4 w-4 shrink-0 ${colours.accent}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-800 group-hover/res:text-slate-900">
                            {r.title}
                          </span>
                          {isExternal && (
                            <ExternalLink className="h-3 w-3 text-slate-400" />
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-4 text-slate-500">
                          {r.description}
                        </p>
                      </div>
                    </div>
                    <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${colours.badge}`}>
                      {typeInfo.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Other communities */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-slate-900">
              Other communities
            </h3>
            <div className="mt-3 space-y-2">
              {COMMUNITIES.filter((c) => c.id !== community.id)
                .slice(0, 4)
                .map((c) => {
                  const OtherIcon = c.icon
                  const otherColours = COLOUR_MAP[c.colour]
                  return (
                    <Link
                      key={c.id}
                      href={`/community/${c.id}`}
                      className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-slate-50"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${otherColours.icon}`}
                      >
                        <OtherIcon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-700">
                        {c.name}
                      </span>
                    </Link>
                  )
                })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
