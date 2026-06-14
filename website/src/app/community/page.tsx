import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { COMMUNITIES } from '@/lib/communities'
import { SlackIcon, DiscordIcon, GitHubIcon } from '@/components/shared/BrandIcons'
import { PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

const platformIcons = {
  slack: SlackIcon,
  discord: DiscordIcon,
  github: GitHubIcon,
} as const

const platforms = [
  { href: 'https://ariaeval.slack.com', Icon: SlackIcon, title: 'Slack workspace', detail: 'Real-time chat across all topics' },
  { href: 'https://discord.gg/ariaeval', Icon: DiscordIcon, title: 'Discord server', detail: 'Voice channels, AMAs, and events' },
  { href: 'https://github.com/ariaeval/community/discussions', Icon: GitHubIcon, title: 'GitHub Discussions', detail: 'Long-form threads and Q&A' },
]

const whyJoin = [
  { title: 'Learn from practitioners', body: 'Hear directly from teams running AI evaluations in production — what works, what breaks, and how they fixed it.' },
  { title: 'Stay ahead of regulation', body: 'Get early insights on EU AI Act compliance, NIST AI RMF adoption, and upcoming FCA/PRA requirements before they become mandates.' },
  { title: 'Shape the platform', body: 'Community feedback directly influences the ARIA roadmap — scenario libraries, judge dimensions, and reporting features.' },
  { title: 'Share scenario libraries', body: 'Contribute and discover community-authored evaluation scenarios for bias testing, red-teaming, and domain-specific safety checks.' },
  { title: 'Early access', body: 'Community members get early access to new features, beta programmes, and research previews before general availability.' },
  { title: 'Network with peers', body: 'Connect with AI safety engineers, compliance officers, risk managers, and product leaders building responsible AI systems.' },
]

export default function CommunityPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Community"
        title="Join the AI safety conversation"
        description="Connect with practitioners, researchers, and teams building trustworthy AI. Share knowledge, discuss emerging standards, and help shape how the industry evaluates and governs AI systems."
        primary={{ href: '/sign-up', label: 'Join the community' }}
        secondary={{ href: '/blog', label: 'Read the blog' }}
      />

      {/* Platform banner */}
      <Section className="py-10">
        <Reveal stagger={0.08} className="grid gap-4 sm:grid-cols-3">
          {platforms.map(({ href, Icon, title, detail }) => (
            <Link
              key={title}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group flex items-center gap-4 rounded-2xl p-4 transition hover:border-cyan-300/30"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-500">{detail}</p>
              </div>
            </Link>
          ))}
        </Reveal>
      </Section>

      {/* Community cards */}
      <Section className="py-6">
        <Reveal stagger={0.07} className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {COMMUNITIES.map((c) => {
            const Icon = c.icon
            return (
              <Link key={c.id} href={`/community/${c.id}`} className="glass group block rounded-2xl p-6 transition hover:border-cyan-300/30">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 text-cyan-300">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <h2 className="font-display text-lg font-semibold text-white">{c.name}</h2>
                    <p className="text-sm leading-6 text-slate-400">{c.description}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {c.topics.map((topic) => (
                    <span key={topic} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs font-medium text-slate-300">
                      {topic}
                    </span>
                  ))}
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                  <div className="flex items-center gap-2.5">
                    {c.channels.map((ch) => {
                      const PlatformIcon = platformIcons[ch.platform]
                      return (
                        <span
                          key={ch.platform}
                          className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-400 transition group-hover:text-slate-200"
                          title={ch.label}
                        >
                          <PlatformIcon className="h-3.5 w-3.5" />
                        </span>
                      )
                    })}
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-300 opacity-0 transition group-hover:opacity-100">
                    Explore <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            )
          })}
        </Reveal>
      </Section>

      {/* Why join */}
      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8 sm:p-10">
          <SectionHeading eyebrow="Why join" title="Why join ARIA communities?" />
          <Reveal stagger={0.06} className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {whyJoin.map((item) => (
              <div key={item.title} className="space-y-2">
                <h3 className="font-display text-sm font-semibold text-white">{item.title}</h3>
                <p className="text-sm leading-6 text-slate-400">{item.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </Section>

      <Section className="py-8 text-center">
        <p className="text-sm text-slate-500">
          Free plan members get full community access.{' '}
          <Link href="/sign-up" className="font-medium text-cyan-300 hover:text-cyan-200">
            Sign up for free
          </Link>{' '}
          and start exploring.
        </p>
      </Section>
    </div>
  )
}
