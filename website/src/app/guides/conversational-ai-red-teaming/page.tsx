import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'
import { JsonLd } from '@/components/shared/JsonLd'
import { buildArticleSchema } from '@/lib/schema'
import { GITHUB_URL } from '@/lib/site'

const PUBLISHED = '2026-06-23'
const DESCRIPTION =
  'Conversational AI red teaming is adversarial testing of the deployed agent — not just the model. This guide explains how it differs from model red teaming, the attacks that matter, and how to run it alongside quality evaluation.'

export const metadata: Metadata = {
  title: 'Conversational AI Red Teaming: A Practical Guide — ARIA Evaluator',
  description: DESCRIPTION,
  alternates: { canonical: '/guides/conversational-ai-red-teaming' },
  openGraph: {
    type: 'article',
    title: 'Conversational AI Red Teaming: A Practical Guide',
    description: DESCRIPTION,
    url: '/guides/conversational-ai-red-teaming',
    publishedTime: PUBLISHED,
  },
}

const whyDifferent = [
  { title: 'You attack the agent, not the model', detail: 'A deployed agent has a system prompt, tools, retrieval, and policies. Vulnerabilities live in that whole stack — not in the base model a scanner probes in isolation.' },
  { title: 'Attacks are multi-turn and conversational', detail: 'The dangerous exploits build over several turns: establish trust, then pivot. Single-shot prompt scanners miss them.' },
  { title: 'Failure is more than an exploit', detail: 'For customer-facing agents, mishandling a vulnerable user or a complaint is a failure too — a risk pure model-security tools don’t score.' },
]

const attacks = [
  { title: 'Prompt injection', detail: 'Instructions hidden in user input or retrieved documents that try to override the agent’s rules.' },
  { title: 'Jailbreaks', detail: 'Role-play, hypotheticals, and obfuscation that walk the agent past its guardrails.' },
  { title: 'Social engineering', detail: 'False authority, urgency, and emotional pressure to extract data or actions the agent should refuse.' },
  { title: 'Data exfiltration', detail: 'Coaxing the agent to reveal its system prompt, other users’ data, or PII.' },
  { title: 'Policy bypass', detail: 'Reframing a forbidden request until the agent complies anyway.' },
  { title: 'Multi-turn escalation', detail: 'Chaining benign-looking turns into an attack no single message would trigger.' },
]

const steps = [
  { step: '01', title: 'Connect the real agent', detail: 'Test through your live adapter — Connect, Lex, Azure, Copilot, OpenAPI, or WebSocket — with your prompts and tools in place.' },
  { step: '02', title: 'Run an attack suite', detail: 'Cover injection, jailbreaks, social engineering, and multi-turn escalation, using templates plus your own scenarios.' },
  { step: '03', title: 'Score with a panel', detail: 'A panel of independent judges grades each attempt; disagreements go to a human reviewer.' },
  { step: '04', title: 'Track and re-test', detail: 'Fix, baseline, and re-run so regressions surface before release — not after.' },
]

export default function ConversationalAiRedTeamingPage() {
  return (
    <div>
      <JsonLd
        data={buildArticleSchema({
          path: '/guides/conversational-ai-red-teaming',
          headline: 'Conversational AI Red Teaming: A Practical Guide',
          description: DESCRIPTION,
          datePublished: PUBLISHED,
        })}
      />

      <PageHeader
        eyebrow="Guide"
        title="Conversational AI red teaming"
        description="How to adversarially test a deployed conversational agent — the attacks that matter, how it differs from model red teaming, and how to run it alongside quality evaluation."
        primary={{ href: '/solutions/ai-red-teaming', label: 'See the solution' }}
        secondary={{ href: '/guides/what-is-ai-agent-evaluation', label: 'New to this? Start here' }}
      />

      {/* Definition */}
      <Section className="py-12">
        <Reveal className="glass rounded-2xl p-6 sm:p-8">
          <p className="text-lg leading-8 text-slate-200">
            <span className="font-semibold text-white">Conversational AI red teaming</span> is the practice of
            adversarially testing a <span className="text-white">deployed agent</span> — its prompts, tools,
            retrieval, and policies — to find where it can be made to leak data, break policy, or behave
            unsafely. It is broader than model red teaming: the target is the whole agent in production, and
            the attacks play out across a real conversation, not a single prompt.
          </p>
        </Reveal>
      </Section>

      {/* Why different */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Why it is its own discipline"
          title="How is it different from model red teaming?"
          subtitle="Scanning a base model for vulnerabilities is necessary but not sufficient. The agent you ship is a different, larger attack surface."
        />
        <Reveal stagger={0.07} className="mt-12 grid gap-5 md:grid-cols-3">
          {whyDifferent.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-5">
              <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Attacks */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="The attack surface"
          title="What attacks should you run?"
          subtitle="A useful red-team suite for a conversational agent covers these patterns at minimum — single-shot and multi-turn."
        />
        <Reveal stagger={0.06} className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {attacks.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-5">
              <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.detail}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Method */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="Method"
          title="How do you red-team a conversational agent?"
          subtitle="The goal is repeatable, evidence-backed adversarial testing you can run on every release — not a one-off manual exercise."
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

      {/* Red-teaming vs evaluation */}
      <Section className="py-12">
        <div className="glass rounded-[1.75rem] p-8">
          <SectionHeading
            eyebrow="Better together"
            title="Red teaming belongs next to evaluation"
            subtitle="An agent that resists every attack but gives wrong, cold, or non-compliant answers still is not ready. Run adversarial and quality scoring in the same framework so one number reflects both."
          />
          <Reveal delay={0.1} className="mt-6">
            <Link
              href="/guides/what-is-ai-agent-evaluation"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
            >
              Read the full guide to AI agent evaluation <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Start red teaming"
        title="Run an adversarial suite on your own agent"
        description="Connect your agent and probe it for injection, jailbreaks, and social engineering — scored by a panel, free to start."
        primary={{ href: GITHUB_URL, label: 'View on GitHub' }}
        secondary={{ href: '/solutions/ai-red-teaming', label: 'Explore the solution' }}
      />
    </div>
  )
}
