import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2, CircleSlash } from 'lucide-react'

import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'
import { JsonLd } from '@/components/shared/JsonLd'
import { buildArticleSchema } from '@/lib/schema'

const PUBLISHED = '2026-06-23'
const DESCRIPTION =
  'A vendor-neutral buyer’s guide to choosing an AI agent evaluation platform: the eight criteria that matter, single-judge vs multi-judge scoring, build vs buy, and where ARIA fits.'

export const metadata: Metadata = {
  title: 'How to Choose an AI Agent Evaluation Platform — ARIA Evaluator',
  description: DESCRIPTION,
  alternates: { canonical: '/guides/choosing-an-ai-agent-evaluation-platform' },
  openGraph: {
    type: 'article',
    title: 'How to Choose an AI Agent Evaluation Platform',
    description: DESCRIPTION,
    url: '/guides/choosing-an-ai-agent-evaluation-platform',
    publishedTime: PUBLISHED,
  },
}

const criteria = [
  { title: 'Judge architecture', detail: 'Does a single model decide every score, or a panel of independent judges? A single judge bakes one model’s blind spots into every result.' },
  { title: 'Human in the loop', detail: 'When the judges disagree, what happens? The hardest, highest-risk cases are exactly the ones a person should review.' },
  { title: 'Adversarial coverage', detail: 'Is red-teaming — prompt injection, jailbreaks, social engineering — built in, or a manual afterthought?' },
  { title: 'Compliance mapping', detail: 'Are dimensions mapped to the frameworks your auditors ask about (FCA Consumer Duty, OWASP LLM Top 10, NIST AI RMF, EU AI Act)?' },
  { title: 'Observability and drift', detail: 'Can you watch runs live and detect quality regressions against a baseline, or only read logs after the fact?' },
  { title: 'Data residency and isolation', detail: 'Where do your transcripts live, and is your workspace isolated from other tenants? This is non-negotiable for regulated data.' },
  { title: 'Integration breadth', detail: 'Does it connect to the agent platforms you actually run without custom glue or SDK changes?' },
  { title: 'Explainability and audit', detail: 'Does every score come with reasoning and an immutable audit trail, or just a number you have to trust?' },
]

const comparison = [
  { criterion: 'Judge architecture', diy: 'One LLM as the sole arbiter', aria: 'Panel of independent judges' },
  { criterion: 'On disagreement', diy: 'No signal — you trust the number', aria: 'Routed to a human reviewer' },
  { criterion: 'Adversarial testing', diy: 'Bolt-on or manual', aria: 'Built in: injection, jailbreak, social engineering' },
  { criterion: 'Compliance mapping', diy: 'Do-it-yourself', aria: 'FCA, OWASP LLM Top 10, NIST AI RMF, EU AI Act' },
  { criterion: 'Observability', diy: 'Logs only', aria: 'Live dashboard + quality-drift baselines' },
  { criterion: 'Data isolation', diy: 'Often shared infrastructure', aria: 'Dedicated tenant, regional residency' },
  { criterion: 'Integrations', diy: 'Custom glue per platform', aria: 'Connect, Lex, Azure, Copilot, OpenAPI, WebSocket' },
  { criterion: 'Evidence', diy: 'A score', aria: 'Reasoning + audit log per result' },
]

const fits = [
  { good: true, text: 'You are putting conversational agents into production, especially in regulated or safety-critical domains.' },
  { good: true, text: 'You need reliability you can defend — multi-judge scoring, human review, and an audit trail.' },
  { good: true, text: 'You require adversarial coverage and compliance evidence, not just accuracy metrics.' },
  { good: true, text: 'Data residency and tenant isolation are hard requirements.' },
  { good: false, text: 'You only need quick, offline metric experiments on a research prototype — a lightweight open-source library may be enough.' },
  { good: false, text: 'You are not yet running an agent against real user journeys — start there first.' },
]

export default function ChoosingPlatformPage() {
  return (
    <div>
      <JsonLd
        data={buildArticleSchema({
          path: '/guides/choosing-an-ai-agent-evaluation-platform',
          headline: 'How to Choose an AI Agent Evaluation Platform',
          description: DESCRIPTION,
          datePublished: PUBLISHED,
        })}
      />

      <PageHeader
        eyebrow="Buyer’s guide"
        title="How to choose an AI agent evaluation platform"
        description="The market is crowded and every tool claims to be best. Here is a vendor-neutral framework for comparing them — the eight criteria that matter, the single-judge-vs-panel question, and an honest take on where ARIA fits."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/guides/what-is-ai-agent-evaluation', label: 'New to this? Start here' }}
      />

      {/* Criteria */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="The checklist"
          title="Eight criteria that actually matter"
          subtitle="Most evaluation tools look similar on a feature grid. These are the dimensions where they genuinely diverge — and where the wrong choice shows up in production, not the demo."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-4 md:grid-cols-2">
          {criteria.map((item, i) => (
            <article key={item.title} className="glass flex gap-4 rounded-2xl p-5">
              <span className="font-display text-sm font-bold text-cyan-200/80">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
              </div>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Comparison table */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="The core question"
          title="Single-judge / DIY vs. a judge panel"
          subtitle="The biggest fork is whether one model scores everything, or a panel does with humans on the hard cases. This table maps a typical do-it-yourself or single-judge setup against ARIA’s approach — by capability, not by brand."
        />
        <Reveal className="mt-10 overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="px-4 py-3 font-medium">DIY / single-judge</th>
                <th className="px-4 py-3 font-medium text-cyan-200">ARIA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {comparison.map((row) => (
                <tr key={row.criterion}>
                  <th scope="row" className="px-4 py-3 align-top font-medium text-white">{row.criterion}</th>
                  <td className="px-4 py-3 align-top text-slate-400">{row.diy}</td>
                  <td className="px-4 py-3 align-top text-slate-200">{row.aria}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Reveal>
      </Section>

      {/* Where ARIA fits */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="An honest fit check"
          title="Where ARIA is — and isn’t — the right call"
          subtitle="No tool is right for everyone. ARIA is built for production evaluation in high-stakes settings; for some teams a lighter approach is the better start."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-4 sm:grid-cols-2">
          {fits.map((item) => (
            <div
              key={item.text}
              className="glass flex items-start gap-3 rounded-2xl p-5"
            >
              {item.good ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              ) : (
                <CircleSlash className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />
              )}
              <p className="text-sm leading-6 text-slate-300">{item.text}</p>
            </div>
          ))}
        </Reveal>
        <Reveal delay={0.1} className="mt-8">
          <Link
            href="/guides/what-is-ai-agent-evaluation"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            Read the full guide to AI agent evaluation <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </Section>

      <CtaBand
        eyebrow="See it on your own agent"
        title="The fastest way to compare is to run it"
        description="Connect your agent and run a free evaluation across all 15 dimensions — then judge the platform on your own transcripts, not a feature grid."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/pricing', label: 'View pricing' }}
      />
    </div>
  )
}
