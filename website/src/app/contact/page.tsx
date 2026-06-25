import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'
import {
  GITHUB_URL,
  GITHUB_ISSUES_URL,
  GITHUB_DISCUSSIONS_URL,
  SLACK_URL,
} from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact ARIA Evaluator',
  description:
    'Get help with ARIA Evaluator from the community: Slack, GitHub Discussions, issues, and responsible security disclosure.',
}

const channels = [
  {
    title: 'Community chat',
    description: 'Ask questions and chat with maintainers and other users in real time on our Slack workspace.',
    action: SLACK_URL,
    actionLabel: 'Open Slack',
  },
  {
    title: 'Discussions',
    description: 'Longer-form Q&A, ideas, and show-and-tell. The best place to ask "how do I…" questions.',
    action: GITHUB_DISCUSSIONS_URL,
    actionLabel: 'Open Discussions',
  },
  {
    title: 'Issues & feature requests',
    description: 'Found a bug or want to propose a feature? Open an issue on GitHub and help shape the roadmap.',
    action: GITHUB_ISSUES_URL,
    actionLabel: 'Open an issue',
  },
]

export default function ContactPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Contact"
        title="Get in touch with the community"
        description="ARIA Evaluator is open source and community-driven. Whether you have a question, found a bug, or want to contribute, here's how to reach maintainers and other users."
        primary={{ href: SLACK_URL, label: 'Join us on Slack' }}
        secondary={{ href: '/docs', label: 'Read the docs' }}
      />

      <Section className="py-12">
        <Reveal stagger={0.08} className="grid gap-5 lg:grid-cols-3">
          {channels.map((channel) => (
            <article key={channel.title} className="glass space-y-3 rounded-2xl p-6">
              <p className="eyebrow">Channel</p>
              <h2 className="font-display text-xl font-semibold text-white">{channel.title}</h2>
              <p className="text-sm leading-6 text-slate-400">{channel.description}</p>
              <a
                href={channel.action}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
              >
                {channel.actionLabel}
              </a>
            </article>
          ))}
        </Reveal>
      </Section>

      <Section className="py-4">
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Reveal className="glass rounded-2xl p-6">
            <p className="eyebrow">How to get a good answer</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Include the right details</h2>
            <ul className="mt-4 space-y-2.5">
              {[
                'What you were trying to do, and what happened instead.',
                'Your environment — OS, Node version, and the adapter/model provider you used.',
                'The exact command you ran and any error messages or log snippets.',
                'A minimal scenario or repro if you can share one.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-400">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-400/70" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="glass rounded-2xl p-6">
            <p className="eyebrow">Security</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">Responsible disclosure</h2>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Found a security issue? Please don&rsquo;t open a public issue. Email{' '}
              <a href="mailto:security@ariaeval.io?subject=Security%20Disclosure" className="font-medium text-cyan-300 hover:text-cyan-200">
                security@ariaeval.io
              </a>{' '}
              or follow our{' '}
              <Link href="/security/disclosure" className="font-medium text-cyan-300 hover:text-cyan-200">
                disclosure policy
              </Link>
              . We&rsquo;ll work with you on a coordinated fix.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8">
          <SectionHeading eyebrow="Prefer self-serve?" title="Start in minutes" />
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
            The fastest way to learn ARIA is to run it. Clone the repository, point it at your model
            provider, and score your first conversation — no account needed.
          </p>
          <Link
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-6 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
          >
            View on GitHub
          </Link>
        </div>
      </Section>
    </div>
  )
}
