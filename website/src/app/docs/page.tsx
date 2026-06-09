import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'ARIA Documentation',
  description:
    'Production documentation for ARIA Evaluator: quick start, deployment, security, evaluation workflows, and operational runbooks.',
}

const docTracks = [
  {
    title: 'Platform quick start',
    description:
      'Set up your first workspace, connect your model endpoint, run baseline checks, and generate a shareable release report.',
    href: '/sign-up',
    cta: 'Start onboarding',
  },
  {
    title: 'Deployment and infrastructure',
    description:
      'Deploy control plane and evaluator environments with reproducible Terraform workflows, backend state controls, and environment separation.',
    href: '/security',
    cta: 'Review deployment security',
  },
  {
    title: 'Evaluation playbooks',
    description:
      'Use structured scenario packs for bias, adversarial behavior, policy alignment, and regression prevention across releases.',
    href: '/community/ai-evaluation',
    cta: 'Explore community playbooks',
  },
  {
    title: 'Operations and incident response',
    description:
      'Monitor run health, investigate failed checks, and apply escalation runbooks for production model incidents.',
    href: '/contact',
    cta: 'Contact support',
  },
]

const quickStartSteps = [
  'Create your ARIA workspace and invite engineering, risk, and security stakeholders.',
  'Configure model endpoints and authentication with environment-scoped credentials.',
  'Run baseline safety and reliability evaluations for your top user journeys.',
  'Add policy gates and release criteria to block high-risk model changes.',
  'Monitor production evaluations continuously and triage regressions with shared evidence.',
]

const references = [
  {
    category: 'API and integrations',
    items: [
      'Auth and session flows',
      'Provisioning and instance lifecycle',
      'Evaluation run submission and status',
      'Reports, exports, and audit evidence',
    ],
  },
  {
    category: 'Governance and compliance',
    items: [
      'Risk scoring and approval workflows',
      'Model change review policies',
      'Data handling and retention controls',
      'Security disclosure and legal docs',
    ],
  },
  {
    category: 'Observability',
    items: [
      'Evaluation trend dashboards',
      'Run-level traceability',
      'Alert routing and incident timelines',
      'Operational SLO and reliability metrics',
    ],
  },
]

export default function DocsPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Documentation</p>
          <div className="max-w-4xl space-y-3">
            <h1 className="page-hero-title">Everything you need to run ARIA in production</h1>
            <p className="page-hero-sub max-w-3xl">
              Learn how to deploy securely, evaluate consistently, and operate with confidence. These docs are built
              for platform, security, and product teams shipping AI systems in real environments.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Get started
            </Link>
            <Link href="/contact" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              Request implementation help
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 md:grid-cols-2">
        {docTracks.map((track) => (
          <article key={track.title} className="card space-y-3">
            <p className="section-label">Guide track</p>
            <h2 className="text-xl font-semibold text-slate-900">{track.title}</h2>
            <p className="text-sm leading-6 text-slate-600">{track.description}</p>
            <div>
              <Link href={track.href} className="inline-flex items-center rounded-full border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50">
                {track.cta}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <article className="card">
          <p className="section-label">Quick start</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">First-day implementation checklist</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            {quickStartSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="card">
          <p className="section-label">Need a direct path?</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Common entry points</h2>
          <div className="mt-4 space-y-2 text-sm">
            <Link href="/pricing" className="block rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">
              Plan and packaging overview
            </Link>
            <Link href="/security" className="block rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">
              Security and deployment controls
            </Link>
            <Link href="/community" className="block rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">
              Community examples and discussions
            </Link>
            <Link href="/contact" className="block rounded-lg border border-slate-200 px-3 py-2 text-slate-700 hover:bg-slate-50">
              Support and solution engineering
            </Link>
          </div>
        </article>
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="section-label">Reference library</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">What documentation covers</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {references.map((group) => (
            <article key={group.category} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <h3 className="text-base font-semibold text-slate-900">{group.category}</h3>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-600">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
