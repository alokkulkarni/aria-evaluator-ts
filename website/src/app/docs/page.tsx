import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

export const metadata: Metadata = {
  title: 'ARIA Documentation',
  description:
    'Production documentation for ARIA Evaluator: quick start, deployment, security, evaluation workflows, and operational runbooks.',
}

const docTracks = [
  { title: 'Platform quick start', description: 'Set up your first workspace, connect your model endpoint, run baseline checks, and generate a shareable release report.', href: '/sign-up', cta: 'Start onboarding' },
  { title: 'Deployment and infrastructure', description: 'Deploy control plane and evaluator environments with reproducible Terraform workflows, backend state controls, and environment separation.', href: '/security', cta: 'Review deployment security' },
  { title: 'Evaluation playbooks', description: 'Use structured scenario packs for bias, adversarial behavior, policy alignment, and regression prevention across releases.', href: '/community/ai-evaluation', cta: 'Explore community playbooks' },
  { title: 'Operations and incident response', description: 'Monitor run health, investigate failed checks, and apply escalation runbooks for production model incidents.', href: '/contact', cta: 'Contact support' },
]

const quickStartSteps = [
  'Create your ARIA workspace and invite engineering, risk, and security stakeholders.',
  'Configure model endpoints and authentication with environment-scoped credentials.',
  'Run baseline safety and reliability evaluations for your top user journeys.',
  'Add policy gates and release criteria to block high-risk model changes.',
  'Monitor production evaluations continuously and triage regressions with shared evidence.',
]

const references = [
  { category: 'API and integrations', items: ['Auth and session flows', 'Provisioning and instance lifecycle', 'Evaluation run submission and status', 'Reports, exports, and audit evidence'] },
  { category: 'Governance and compliance', items: ['Risk scoring and approval workflows', 'Model change review policies', 'Data handling and retention controls', 'Security disclosure and legal docs'] },
  { category: 'Observability', items: ['Evaluation trend dashboards', 'Run-level traceability', 'Alert routing and incident timelines', 'Operational SLO and reliability metrics'] },
]

const entryPoints = [
  { label: 'Plan and packaging overview', href: '/pricing' },
  { label: 'Security and deployment controls', href: '/security' },
  { label: 'Community examples and discussions', href: '/community' },
  { label: 'Support and solution engineering', href: '/contact' },
]

export default function DocsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Documentation"
        title="Everything you need to run ARIA in production"
        description="Learn how to deploy securely, evaluate consistently, and operate with confidence. These docs are built for platform, security, and product teams shipping AI systems in real environments."
        primary={{ href: '/sign-up', label: 'Get started' }}
        secondary={{ href: '/contact', label: 'Request implementation help' }}
      />

      <Section className="py-12">
        <Reveal stagger={0.08} className="grid gap-5 md:grid-cols-2">
          {docTracks.map((track) => (
            <article key={track.title} className="glass space-y-3 rounded-2xl p-6">
              <p className="eyebrow">Guide track</p>
              <h2 className="font-display text-xl font-semibold text-white">{track.title}</h2>
              <p className="text-sm leading-6 text-slate-400">{track.description}</p>
              <Link href={track.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                {track.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </Reveal>
      </Section>

      <Section className="py-4">
        <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <Reveal className="glass rounded-2xl p-6">
            <p className="eyebrow">Quick start</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">First-day implementation checklist</h2>
            <ol className="mt-5 space-y-3">
              {quickStartSteps.map((step, i) => (
                <li key={step} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-semibold text-cyan-300">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </Reveal>

          <Reveal delay={0.1} className="glass rounded-2xl p-6">
            <p className="eyebrow">Need a direct path?</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">Common entry points</h2>
            <div className="mt-4 space-y-2 text-sm">
              {entryPoints.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-slate-300 transition hover:border-cyan-300/30 hover:bg-white/[0.06] hover:text-white"
                >
                  {e.label}
                  <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </Section>

      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8">
          <SectionHeading eyebrow="Reference library" title="What documentation covers" />
          <Reveal stagger={0.08} className="mt-8 grid gap-4 md:grid-cols-3">
            {references.map((group) => (
              <article key={group.category} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <h3 className="font-display text-base font-semibold text-white">{group.category}</h3>
                <ul className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-400">
                      <span className="h-1 w-1 rounded-full bg-cyan-400/70" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Get hands on"
        title="Spin up a workspace and follow along"
        description="The fastest way to learn ARIA is to run your first evaluation. Create a free workspace and work through the quick start."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/contact', label: 'Contact support' }}
      />
    </div>
  )
}
