import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, BookOpen, ExternalLink, FileText, MessageSquare, Newspaper, Pin, Users, Wrench } from 'lucide-react'

import { COMMUNITIES, getCommunityById } from '@/lib/communities'
import { SlackIcon, DiscordIcon, GitHubIcon } from '@/components/shared/BrandIcons'
import { Section } from '@/components/marketing/ui'

const platformMeta = {
  slack: { icon: SlackIcon, label: 'Slack', colour: 'bg-[#4A154B] hover:bg-[#3a1140]' },
  discord: { icon: DiscordIcon, label: 'Discord', colour: 'bg-[#5865F2] hover:bg-[#4752c4]' },
  github: { icon: GitHubIcon, label: 'GitHub Discussions', colour: 'bg-slate-700 hover:bg-slate-600' },
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

export default async function CommunityDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = getCommunityById(slug)
  if (!community) return notFound()

  const Icon = community.icon

  return (
    <Section className="py-12">
      <Link href="/community" className="mb-6 inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-cyan-300">
        <ArrowLeft className="h-3.5 w-3.5" />
        All communities
      </Link>

      {/* Header */}
      <section className="glass-strong relative overflow-hidden rounded-[1.75rem] p-8">
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex items-start gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 text-cyan-300">
            <Icon className="h-7 w-7" />
          </div>
          <div className="space-y-3">
            <p className="eyebrow">{community.tagline}</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">{community.name}</h1>
            <p className="max-w-2xl text-sm leading-6 text-slate-400">{community.longDescription}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {community.topics.map((topic) => (
                <span key={topic} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Two-column */}
      <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Discussions */}
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-white">Discussions</h2>
            <Link
              href="/sign-up"
              className="rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-3.5 py-1.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              Start a discussion
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {community.discussions.map((d, i) => (
              <article key={i} className="glass group flex items-start gap-4 rounded-2xl p-4 transition hover:border-cyan-300/30">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    {d.pinned && <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-300" />}
                    <h3 className="text-sm font-medium text-white">{d.title}</h3>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500">
                    <span className="font-medium text-slate-400">@{d.author}</span>
                    <span>·</span>
                    <span>{d.replies} replies</span>
                    <span>·</span>
                    <span>{d.date}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
            <MessageSquare className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-medium text-slate-200">Join the conversation</p>
            <p className="mt-1 text-xs text-slate-500">Sign up for a free account to post, reply, and follow discussions.</p>
            <Link href="/sign-up" className="mt-4 inline-flex rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">
              Sign up free
            </Link>
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-6">
          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white">Join on</h3>
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

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white">About</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">{community.description}</p>
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <Users className="h-4 w-4 text-cyan-300" />
              <span className="text-sm font-medium text-slate-200">{community.members}</span>
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white">Resources</h3>
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
                    className="group/res block rounded-xl border border-white/10 p-3 transition hover:border-cyan-300/30 hover:bg-white/[0.04]"
                  >
                    <div className="flex items-start gap-3">
                      <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium text-slate-200">{r.title}</span>
                          {isExternal && <ExternalLink className="h-3 w-3 text-slate-500" />}
                        </div>
                        <p className="mt-0.5 text-xs leading-4 text-slate-500">{r.description}</p>
                      </div>
                    </div>
                    <span className="mt-2 inline-block rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      {typeInfo.label}
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="glass rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white">Other communities</h3>
            <div className="mt-3 space-y-2">
              {COMMUNITIES.filter((c) => c.id !== community.id)
                .slice(0, 4)
                .map((c) => {
                  const OtherIcon = c.icon
                  return (
                    <Link key={c.id} href={`/community/${c.id}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-cyan-300">
                        <OtherIcon className="h-4 w-4" />
                      </div>
                      <span className="text-sm font-medium text-slate-300">{c.name}</span>
                    </Link>
                  )
                })}
            </div>
          </div>
        </aside>
      </div>
    </Section>
  )
}
