import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BadgeCheck, Bug, Crosshair, Lock, ShieldAlert } from 'lucide-react'

import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

const DESCRIPTION =
  'Red-team your conversational AI agents before attackers do. ARIA runs prompt injection, jailbreak, and social-engineering attacks against your live agent — scored by a panel of judges with human review, mapped to OWASP LLM Top 10, NIST AI RMF, and FCA controls.'

export const metadata: Metadata = {
  title: 'AI Red Teaming for Conversational Agents — ARIA Evaluator',
  description: DESCRIPTION,
  alternates: { canonical: '/solutions/ai-red-teaming' },
  openGraph: {
    type: 'website',
    title: 'AI Red Teaming for Conversational Agents',
    description: DESCRIPTION,
    url: '/solutions/ai-red-teaming',
  },
}

const threats = [
  { icon: Crosshair, title: 'Prompt injection', description: 'Hidden instructions in user input or retrieved content that try to override the agent’s rules and policies.' },
  { icon: ShieldAlert, title: 'Jailbreaks', description: 'Role-play, obfuscation, and multi-turn setups engineered to coax the agent past its guardrails.' },
  { icon: Bug, title: 'Social engineering', description: 'False authority, urgency, and pressure used to extract data or trigger actions the agent should refuse.' },
  { icon: Lock, title: 'Data exfiltration', description: 'Attempts to leak system prompts, other users’ data, or PII the agent was never meant to reveal.' },
]

const wedge = [
  'Most red-team tools attack the model in isolation. ARIA attacks the agent you actually ship — through your real adapter, with your tools, prompts, and policies in play.',
  'Every attack is scored across security and quality and compliance, so you see not just whether a guardrail held, but whether the agent stayed helpful, on-tone, and policy-correct under pressure.',
  'Findings are scored by a panel of independent judges; anything they disagree on is routed to a human reviewer, with the reasoning and an audit trail attached to every result.',
]

const dimensions = [
  { name: 'Prompt Injection Resistance', detail: 'Did the agent hold its rules when instructions were injected mid-conversation?' },
  { name: 'Guardrail Compliance', detail: 'Did it refuse out-of-policy requests cleanly, without leaking or improvising?' },
  { name: 'Bias & Fairness', detail: 'Did adversarial framing provoke biased or unfair treatment across groups?' },
  { name: 'Vulnerability Detection', detail: 'Did it recognise distress or coercion signals an attacker might exploit?' },
  { name: 'Escalation Appropriateness', detail: 'Did it escalate to a human at the right moment instead of pressing on?' },
]

const compliance = ['OWASP LLM Top 10', 'NIST AI RMF', 'EU AI Act', 'FCA Consumer Duty', 'MITRE ATLAS']

export default function AiRedTeamingPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Solution"
        title="Red-team your conversational AI before it ships"
        description="ARIA runs prompt injection, jailbreak, and social-engineering attacks against your live agent — not just the model — and scores every attempt with a panel of judges and human review. Adversarial coverage and compliance evidence in one run."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/security', label: 'See our security posture' }}
        pills={['Prompt injection', 'Jailbreaks', 'Social engineering', 'Human-reviewed']}
      />

      {/* Threats */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="What we attack"
          title="The failure modes that don’t show up in accuracy tests"
          subtitle="A conversational agent can be helpful and polite and still be one crafted prompt away from leaking data or breaking policy. ARIA probes the attacks that matter for agents in production."
        />
        <Reveal stagger={0.08} className="mt-12 grid gap-5 md:grid-cols-2">
          {threats.map((item) => (
            <FeatureCard key={item.title} icon={item.icon} title={item.title} description={item.description} />
          ))}
        </Reveal>
      </Section>

      {/* The wedge */}
      <Section className="py-12">
        <div className="glass-strong relative overflow-hidden rounded-[1.75rem] p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
          <SectionHeading
            eyebrow="The difference"
            title="Red-teaming and evaluation, in one run"
            subtitle="Security tools tell you a guardrail broke. ARIA tells you that — and whether the agent stayed accurate, on-tone, and compliant while under attack."
          />
          <Reveal stagger={0.08} className="mt-10 grid gap-4 lg:grid-cols-3">
            {wedge.map((text) => (
              <div key={text} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-7 text-slate-300">
                {text}
              </div>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* Dimensions */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="How attacks are scored"
          title="Adversarial findings, mapped to dimensions"
          subtitle="Each attack is scored on the dimensions that decide whether your agent is safe to ship — part of the same 15-dimension framework that grades quality."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-4 sm:grid-cols-2">
          {dimensions.map((item) => (
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

      {/* Compliance + learn more */}
      <Section className="py-12">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal className="glass space-y-4 rounded-2xl p-6 sm:p-8">
            <p className="eyebrow">Evidence for auditors</p>
            <h3 className="font-display text-xl font-semibold text-white">Mapped to the frameworks security teams report against</h3>
            <div className="flex flex-wrap gap-2.5 pt-1">
              {compliance.map((c) => (
                <span key={c} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                  {c}
                </span>
              ))}
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Every adversarial run produces a report with the attack, the agent&rsquo;s response, the judges&rsquo;
              reasoning, and an immutable audit trail — the evidence a regulator or security reviewer asks for.
            </p>
          </Reveal>

          <Reveal delay={0.1} className="glass space-y-4 rounded-2xl p-6 sm:p-8">
            <p className="eyebrow">New to this?</p>
            <h3 className="font-display text-xl font-semibold text-white">Start with the fundamentals</h3>
            <p className="text-sm leading-6 text-slate-400">
              Read how conversational AI red teaming differs from model scanning, and where it fits alongside
              quality evaluation.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <Link href="/guides/conversational-ai-red-teaming" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
                Guide: conversational AI red teaming <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/guides/what-is-ai-agent-evaluation" className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
                Guide: what is AI agent evaluation <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Find the holes first"
        title="Attack your agent before someone else does"
        description="Connect your agent and run an adversarial suite across prompt injection, jailbreaks, and social engineering — free to start."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/contact', label: 'Talk to our team' }}
      />
    </div>
  )
}
