import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Scale,
  ShieldAlert,
  Users,
} from 'lucide-react'

import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'
import { JsonLd } from '@/components/shared/JsonLd'
import { buildArticleSchema } from '@/lib/schema'

const PUBLISHED = '2026-06-23'
const DESCRIPTION =
  'AI agent evaluation is how teams measure whether a conversational AI agent is accurate, safe, and compliant before and after it ships. This guide explains what to measure, how multi-judge scoring works, and how to get started.'

export const metadata: Metadata = {
  title: 'What is AI Agent Evaluation? A Complete Guide — ARIA Evaluator',
  description: DESCRIPTION,
  alternates: { canonical: '/guides/what-is-ai-agent-evaluation' },
  openGraph: {
    type: 'article',
    title: 'What is AI Agent Evaluation? A Complete Guide',
    description: DESCRIPTION,
    url: '/guides/what-is-ai-agent-evaluation',
    publishedTime: PUBLISHED,
  },
}

const risks = [
  {
    icon: AlertTriangle,
    title: 'Wrong or made-up answers',
    description:
      'Agents hallucinate, misread intent, and answer confidently when they should not. Without evaluation you find out from a customer, not a test.',
  },
  {
    icon: ShieldAlert,
    title: 'Safety and guardrail failures',
    description:
      'A single crafted prompt can make an agent leak data, bypass policy, or produce harmful output. These failures are invisible to accuracy-only testing.',
  },
  {
    icon: Scale,
    title: 'Compliance and regulatory exposure',
    description:
      'In regulated domains, an agent that mishandles a complaint, a vulnerable customer, or a disclosure is a reportable event — not just a bad reply.',
  },
  {
    icon: Users,
    title: 'Mishandled escalations',
    description:
      'Knowing when to hand off to a human, and doing it cleanly, is its own skill. Agents that miss distress signals or escalate poorly erode trust fast.',
  },
]

const dimensionGroups = [
  {
    category: 'Response Quality',
    dimensions: ['Correctness', 'Faithfulness', 'Helpfulness', 'Relevance', 'Conciseness'],
  },
  { category: 'Task Completion', dimensions: ['Goal Success', 'Task Completion Rate'] },
  {
    category: 'Safety & Security',
    dimensions: ['Guardrail Compliance', 'Prompt Injection Resistance', 'Bias & Fairness'],
  },
  { category: 'Customer Experience', dimensions: ['Tone & Empathy', 'Clarity'] },
  {
    category: 'Escalation & Vulnerability',
    dimensions: ['Escalation Appropriateness', 'Handover Quality', 'Vulnerability Detection'],
  },
]

const adversarial = [
  { title: 'Prompt injection', detail: 'Hidden instructions in user input or retrieved content that try to override the agent’s rules.' },
  { title: 'Jailbreaks', detail: 'Role-play, obfuscation, and multi-turn setups designed to coax the agent past its guardrails.' },
  { title: 'Social engineering', detail: 'Pressure, false authority, and urgency used to extract data or actions the agent should refuse.' },
]

const compliance = [
  { name: 'FCA Consumer Duty', detail: 'Vulnerability detection and escalation scoring for financial-services conduct rules.' },
  { name: 'OWASP LLM Top 10', detail: 'Coverage for the most common large-language-model security risks, including injection.' },
  { name: 'NIST AI RMF', detail: 'Evaluation mapped to the measure and manage functions of the AI Risk Management Framework.' },
  { name: 'EU AI Act', detail: 'Evidence and audit trails to support high-risk system obligations.' },
]

const steps = [
  { step: '01', title: 'Connect your agent', detail: 'Point an adapter at your agent — Amazon Connect, Lex, Azure Bot Service, Microsoft Copilot, OpenAPI/REST, or WebSocket. No SDK changes.' },
  { step: '02', title: 'Define scenarios', detail: 'Pick quality scenarios and adversarial attacks. Templates cover common journeys and red-team patterns out of the box.' },
  { step: '03', title: 'Run the panel', detail: 'Each conversation is scored across the 15 dimensions by multiple independent judges, with disagreements routed to human review.' },
  { step: '04', title: 'Ship with evidence', detail: 'Read the reasoning behind every score, track quality drift against a baseline, and release with a number you can defend to an auditor.' },
]

export default function WhatIsAiAgentEvaluationPage() {
  return (
    <div>
      <JsonLd
        data={buildArticleSchema({
          path: '/guides/what-is-ai-agent-evaluation',
          headline: 'What is AI Agent Evaluation? A Complete Guide',
          description: DESCRIPTION,
          datePublished: PUBLISHED,
        })}
      />

      <PageHeader
        eyebrow="Guide"
        title="What is AI agent evaluation?"
        description="A plain-English guide to measuring whether a conversational AI agent is accurate, safe, and compliant — before and after it reaches your customers."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/guides/choosing-an-ai-agent-evaluation-platform', label: 'How to choose a platform' }}
      />

      {/* Definition */}
      <Section className="py-12">
        <Reveal className="glass rounded-2xl p-6 sm:p-8">
          <p className="text-lg leading-8 text-slate-200">
            <span className="font-semibold text-white">AI agent evaluation</span> is the practice of
            measuring how well a conversational AI agent performs before and after it ships — scoring real
            transcripts for response quality, task completion, safety, and compliance, and stress-testing
            the agent against adversarial attacks. Done well, it turns &ldquo;it seemed fine in testing&rdquo;
            into a verifiable quality and safety score you can stand behind.
          </p>
        </Reveal>
      </Section>

      {/* Why it matters */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="The stakes"
          title="Why does AI agent evaluation matter?"
          subtitle="A conversational agent acts on your behalf in front of customers. The failure modes are not just wrong answers — they are safety, compliance, and trust failures that accuracy-only checks never see."
        />
        <Reveal stagger={0.08} className="mt-12 grid gap-5 md:grid-cols-2">
          {risks.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </Reveal>
      </Section>

      {/* 15 dimensions */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="What to measure"
          title="What should you measure? The 15 dimensions"
          subtitle="A complete evaluation looks beyond &ldquo;was the answer right.&rdquo; ARIA scores every conversation across 15 dimensions grouped into five areas — so a fast, polite agent that quietly breaks policy still fails."
        />
        <Reveal stagger={0.08} className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dimensionGroups.map((group) => (
            <article key={group.category} className="glass rounded-2xl p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-base font-semibold text-white">{group.category}</h3>
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                  {group.dimensions.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {group.dimensions.map((d) => (
                  <li key={d} className="flex items-center gap-2 text-sm leading-6 text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-cyan-400" />
                    {d}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* How scoring works */}
      <Section className="py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div className="space-y-5">
            <SectionHeading
              eyebrow="Methodology"
              title="How does scoring work?"
            />
            <Reveal delay={0.1}>
              <p className="text-base leading-7 text-slate-400">
                Most pipelines use a single model as the judge. That bakes one model&rsquo;s blind spots into
                every score. ARIA instead submits each conversation to a <span className="text-slate-200">panel
                of independent AI judges</span>. When they agree, you get a confident score; when they
                disagree, the case is routed to a <span className="text-slate-200">human reviewer</span> who
                makes the final call. Judges are continually checked against expert humans, and every score
                comes with the reasoning behind it — so the number holds up under scrutiny.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <Link
                href="/guides/choosing-an-ai-agent-evaluation-platform"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
              >
                Single judge vs. a panel — how to choose <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
          </div>
          <Reveal delay={0.1} className="glass-strong rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 p-3 text-cyan-300">
                <BadgeCheck className="h-5 w-5" />
              </span>
              <h3 className="font-display text-base font-semibold text-white">Why a panel beats a single judge</h3>
            </div>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">No single model&rsquo;s blind spot can silently skew a result.</li>
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">Disagreement becomes a signal — the hard cases reach a person.</li>
              <li className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">Scores carry reasoning and an audit trail, not just a number.</li>
            </ul>
          </Reveal>
        </div>
      </Section>

      {/* Adversarial */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Security"
          title="What is adversarial (red-team) testing?"
          subtitle="Quality testing asks whether the agent helps. Adversarial testing asks whether it can be made to misbehave. Both matter — and the second is where most teams have the least coverage."
        />
        <Reveal stagger={0.07} className="mt-12 grid gap-5 md:grid-cols-3">
          {adversarial.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-5">
              <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </Reveal>
        <Reveal delay={0.1} className="mt-6">
          <Link
            href="/guides/conversational-ai-red-teaming"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            Deep dive: conversational AI red teaming <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>
      </Section>

      {/* Compliance */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Compliance"
          title="How does evaluation support compliance?"
          subtitle="For regulated teams, evaluation is the evidence layer. ARIA maps dimensions and adversarial coverage to the frameworks auditors actually ask about."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-4 sm:grid-cols-2">
          {compliance.map((item) => (
            <article key={item.name} className="glass flex items-start gap-3 rounded-2xl p-5">
              <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <h3 className="font-display text-base font-semibold text-white">{item.name}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
              </div>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Get started */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Get started"
          title="How do you start evaluating an agent?"
        />
        <Reveal stagger={0.1} className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((item) => (
            <article key={item.step} className="glass relative rounded-2xl p-6">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/20 to-blue-400/5 font-display text-sm font-bold text-cyan-200">
                {item.step}
              </span>
              <h3 className="mt-4 font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      <CtaBand
        eyebrow="Ready to evaluate"
        title="Put your agent in front of a panel of judges"
        description="Create a workspace, connect your agent, and run your first 15-dimension evaluation in minutes — free."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/pricing', label: 'View pricing' }}
      />
    </div>
  )
}
