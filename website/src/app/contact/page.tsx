import type { Metadata } from 'next'
import Link from 'next/link'

import { PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

export const metadata: Metadata = {
  title: 'Contact ARIA Evaluator',
  description:
    'Contact ARIA for enterprise onboarding, security reviews, technical support, and partnership conversations.',
}

const channels = [
  { title: 'Sales and onboarding', description: 'Scope deployment needs, pricing, and rollout plans with our solutions team.', action: 'mailto:sales@ariaeval.io?subject=ARIA%20Evaluator%20Inquiry', actionLabel: 'Email sales' },
  { title: 'Technical support', description: 'Get help with setup, integrations, and production troubleshooting.', action: 'mailto:support@ariaeval.io?subject=ARIA%20Support%20Request', actionLabel: 'Email support' },
  { title: 'Security and compliance', description: 'Request security documentation, architecture reviews, or vendor due diligence material.', action: 'mailto:security@ariaeval.io?subject=Security%20Review%20Request', actionLabel: 'Contact security' },
]

const responseGuidelines = [
  { requestType: 'General inquiry', targetResponse: 'Within 1 business day' },
  { requestType: 'Support request', targetResponse: 'Within 4 business hours' },
  { requestType: 'Security questionnaire', targetResponse: 'Within 2 business days' },
  { requestType: 'Incident escalation', targetResponse: 'Within 1 hour' },
]

export default function ContactPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Contact"
        title="Get in touch with the ARIA team"
        description="Whether you're evaluating rollout options, planning a pilot, or handling a production incident, we'll connect you with the right team quickly."
        primary={{ href: 'mailto:sales@ariaeval.io?subject=ARIA%20Evaluator%20Inquiry', label: 'Contact sales' }}
        secondary={{ href: '/docs', label: 'Read docs first' }}
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
            <p className="eyebrow">How to reach us effectively</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Include the right details for faster help</h2>
            <ul className="mt-4 space-y-2.5">
              {[
                'Your organization name and workspace URL (if available).',
                'Clear symptom description, expected behavior, and when the issue started.',
                'Relevant request IDs, screenshots, error messages, or log snippets.',
                'Business impact level and any active incident timeline requirements.',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm leading-6 text-slate-400">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-400/70" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="glass rounded-2xl p-6">
            <p className="eyebrow">Availability</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">Coverage windows</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-400">
              <p><span className="font-medium text-slate-200">Business support:</span> Monday–Friday, 09:00–18:00 UTC</p>
              <p><span className="font-medium text-slate-200">Incident triage:</span> 24/7 for production severity cases</p>
              <p><span className="font-medium text-slate-200">Primary timezone:</span> UK / EU operations</p>
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8">
          <SectionHeading eyebrow="Response targets" title="Typical response SLAs" />
          <Reveal className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/[0.04]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Request type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Target first response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {responseGuidelines.map((row) => (
                  <tr key={row.requestType} className="transition hover:bg-white/[0.03]">
                    <td className="px-4 py-3 text-sm text-slate-300">{row.requestType}</td>
                    <td className="px-4 py-3 text-sm font-medium text-white">{row.targetResponse}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <p className="mt-6 text-sm text-slate-500">
            Prefer self-serve?{' '}
            <Link href="/sign-up" className="font-medium text-cyan-300 hover:text-cyan-200">
              Create a free workspace
            </Link>{' '}
            and start evaluating in minutes.
          </p>
        </div>
      </Section>
    </div>
  )
}
