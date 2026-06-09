import Link from 'next/link'
import { Users, ArrowRight } from 'lucide-react'

import { COMMUNITIES, COLOUR_MAP } from '@/lib/communities'
import { SlackIcon, DiscordIcon, GitHubIcon } from '@/components/shared/BrandIcons'

const platformIcons = {
  slack: SlackIcon,
  discord: DiscordIcon,
  github: GitHubIcon,
} as const

export default function CommunityPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Community</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">
              Join the AI safety conversation
            </h1>
            <p className="page-hero-sub max-w-2xl">
              Connect with practitioners, researchers, and teams building
              trustworthy AI. Share knowledge, discuss emerging standards, and
              help shape how the industry evaluates and governs AI systems.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/sign-up"
              className="rounded-full bg-cyan-400 px-3.5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Join the community
            </Link>
            <Link
              href="/blog"
              className="rounded-full border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
            >
              Read the blog
            </Link>
          </div>
        </div>
      </section>

      {/* Platform banner */}
      <section className="mt-10 grid gap-4 sm:grid-cols-3">
        <Link
          href="https://ariaeval.slack.com"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 p-4 transition hover:border-[#4A154B]/30"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4A154B]/10">
            <SlackIcon className="h-5 w-5 text-[#4A154B]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Slack workspace</p>
            <p className="text-xs text-slate-500">Real-time chat across all topics</p>
          </div>
        </Link>
        <Link
          href="https://discord.gg/ariaeval"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 p-4 transition hover:border-[#5865F2]/30"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#5865F2]/10">
            <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Discord server</p>
            <p className="text-xs text-slate-500">Voice channels, AMAs, and events</p>
          </div>
        </Link>
        <Link
          href="https://github.com/ariaeval/community/discussions"
          target="_blank"
          rel="noopener noreferrer"
          className="card group flex items-center gap-4 p-4 transition hover:border-slate-400/30"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <GitHubIcon className="h-5 w-5 text-slate-800" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">GitHub Discussions</p>
            <p className="text-xs text-slate-500">Long-form threads and Q&amp;A</p>
          </div>
        </Link>
      </section>

      {/* Community Cards */}
      <section className="mt-12 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {COMMUNITIES.map((c) => {
          const Icon = c.icon
          const colours = COLOUR_MAP[c.colour]
          return (
            <Link
              key={c.id}
              href={`/community/${c.id}`}
              className={`card group block p-6 transition ${colours.card}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colours.icon}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <h2 className="text-lg font-semibold text-slate-900">
                    {c.name}
                  </h2>
                  <p className="text-sm leading-6 text-slate-600">
                    {c.description}
                  </p>
                </div>
              </div>

              {/* Topic badges */}
              <div className="mt-4 flex flex-wrap gap-2">
                {c.topics.map((topic) => (
                  <span
                    key={topic}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colours.badge}`}
                  >
                    {topic}
                  </span>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2.5">
                  {c.channels.map((ch) => {
                    const PlatformIcon = platformIcons[ch.platform]
                    return (
                      <span
                        key={ch.platform}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition group-hover:bg-slate-200 group-hover:text-slate-700"
                        title={ch.label}
                      >
                        <PlatformIcon className="h-3.5 w-3.5" />
                      </span>
                    )
                  })}
                </div>
                <span className={`flex items-center gap-1.5 text-xs font-medium ${colours.accent} opacity-0 transition group-hover:opacity-100`}>
                  Explore
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          )
        })}
      </section>

      {/* Why join */}
      <section className="mt-16 card p-8 sm:p-10">
        <h2 className="text-2xl font-bold text-slate-900">
          Why join ARIA communities?
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: 'Learn from practitioners',
              body: 'Hear directly from teams running AI evaluations in production — what works, what breaks, and how they fixed it.',
            },
            {
              title: 'Stay ahead of regulation',
              body: 'Get early insights on EU AI Act compliance, NIST AI RMF adoption, and upcoming FCA/PRA requirements before they become mandates.',
            },
            {
              title: 'Shape the platform',
              body: 'Community feedback directly influences ARIA Evaluator roadmap priorities — scenario libraries, judge dimensions, and reporting features.',
            },
            {
              title: 'Share scenario libraries',
              body: 'Contribute and discover community-authored evaluation scenarios for bias testing, red-teaming, and domain-specific safety checks.',
            },
            {
              title: 'Early access',
              body: 'Community members get early access to new features, beta programmes, and research previews before general availability.',
            },
            {
              title: 'Network with peers',
              body: 'Connect with AI safety engineers, compliance officers, risk managers, and product leaders building responsible AI systems.',
            },
          ].map((item) => (
            <div key={item.title} className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mt-12 text-center">
        <p className="text-sm text-slate-500">
          Free plan members get full community access.{' '}
          <Link
            href="/sign-up"
            className="font-medium text-cyan-600 hover:text-cyan-500"
          >
            Sign up for free
          </Link>{' '}
          and start exploring.
        </p>
      </section>
    </div>
  )
}
