import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

import { CtaBand, PageHeader, Section, SectionHeading, StatCard } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

export const metadata: Metadata = {
  title: 'About — ARIA Evaluator',
  description:
    'ARIA Evaluator was built to close the gap between deploying conversational AI agents and being confident they are safe, compliant, and reliable in production.',
}

const thesis = [
  {
    number: '01',
    title: 'The deployment gap is the real risk',
    body: 'Most AI incidents in production are not catastrophic failures — they are subtle ones. An escalation path that almost works. A guardrail that holds under direct attack but yields under social engineering framing. A bias that only surfaces at turn seven of a multi-step conversation. Standard QA tooling misses all of these because it was never designed for conversational, multi-turn, stochastic systems.',
  },
  {
    number: '02',
    title: 'Evaluation is an operating discipline, not a pre-launch checklist',
    body: 'Agent behaviour drifts. Prompts change. LLM providers update models without notice. A score that was true at release can become false within weeks. Teams that treat evaluation as a one-time gate before launch are operating on stale signal. ARIA is designed around the premise that evaluation is continuous — run at every release, on a schedule, and in response to operational signals.',
  },
  {
    number: '03',
    title: 'Compliance requires evidence, not intent',
    body: 'Regulated-industry teams cannot submit intent to an auditor. FCA Consumer Duty, HIPAA, and financial services AI governance frameworks all require demonstrable, traceable evidence that the system behaves correctly in the scenarios that matter. ARIA produces that evidence: structured scores, judge reasoning, and immutable run history that auditors can review.',
  },
]

const milestones = [
  {
    year: '2024',
    quarter: 'Q1–Q2',
    title: 'The first evaluation framework',
    detail:
      'The earliest version of ARIA was built as an internal tool for evaluating Amazon Connect and Lex agents in a financial services context. The initial focus was adversarial testing — prompt injection, social engineering, and guardrail verification. A custom LLM-judge architecture scored transcripts across a structured rubric instead of relying on keyword matching or manual review.',
  },
  {
    year: '2024',
    quarter: 'Q3–Q4',
    title: 'Expanding the evaluation model',
    detail:
      'The dimension framework expanded to 15 evaluation criteria covering response quality, task completion, safety and security, customer experience, and escalation compliance. Azure Bot Service and OpenAPI adapters were added, making ARIA platform-agnostic. The first version of the bias and fairness dimension was introduced after observing inconsistent treatment patterns in demographic testing.',
  },
  {
    year: '2025',
    quarter: 'Q1–Q3',
    title: 'Multi-tenant architecture and control plane',
    detail:
      'ARIA was rebuilt around a dedicated-tenant model — every workspace runs in isolated infrastructure. The control plane introduced tenant lifecycle management, region selection, role-based access, and scheduled evaluation runs. The human review queue allowed compliance and risk teams to participate in the evaluation process alongside engineers.',
  },
  {
    year: '2025',
    quarter: 'Q4',
    title: 'Regulatory framework alignment',
    detail:
      'Escalation Appropriateness and Vulnerability Detection dimensions were formalised against FCA Consumer Duty requirements. The audit log, run history, and report export capabilities were hardened to produce evidence packages suitable for regulatory review. The first structured compliance playbooks were documented.',
  },
  {
    year: '2026',
    quarter: 'Q1–Q2',
    title: 'Platform and production launch',
    detail:
      'ARIA launched as a fully managed SaaS platform with global region support, CloudFront delivery, ECS Fargate isolation, and Secrets Manager credential handling. The website and self-serve onboarding were built. Security controls were aligned to SOC 2 and ISO 27001 frameworks, with certification underway.',
  },
]

const principles = [
  {
    title: 'Safety-by-default design',
    body: 'Security and compliance controls are first-class features, not add-ons. Every ARIA run evaluates guardrail compliance, prompt injection resistance, and escalation behaviour as standard — teams do not have to configure safety in.',
  },
  {
    title: 'Reproducibility over coverage',
    body: 'A test that cannot be reproduced is a guess. ARIA runs are deterministic: same scenario, same adapter configuration, same judge model produces comparable results across releases. This is what makes regression testing and baseline comparison meaningful.',
  },
  {
    title: 'Evidence over assertion',
    body: 'Every score ARIA produces comes with judge reasoning you can read, quote, and export. The goal is not a pass/fail number — it is an auditable record that explains why the system scored the way it did, trace by trace.',
  },
  {
    title: 'Platform teams first',
    body: 'ARIA is built for the people who own the reliability of AI systems in production: platform engineers, security architects, risk leads, and the compliance teams that sign off on their work. The product is designed around their workflows, not a researcher\'s notebook.',
  },
  {
    title: 'Practical governance',
    body: 'Governance frameworks matter only if product teams can act on them. ARIA translates policy intent — FCA Consumer Duty, HIPAA safeguard requirements, bias standards — into discrete, scorable dimensions that both engineers and compliance teams can reason about.',
  },
  {
    title: 'Continuous, not periodic',
    body: 'Pre-release evaluation is necessary but not sufficient. Scheduled regression runs, baseline comparison, and scheduled red-team packs give teams the ability to detect drift between releases — not just at the gate.',
  },
]

export default function AboutPage() {
  return (
    <div>
      <PageHeader
        eyebrow="About ARIA Evaluator"
        title="Close the gap between deploying AI and trusting it"
        description="ARIA Evaluator gives engineering, security, and governance teams one operating layer for AI agent testing, release controls, compliance evidence, and post-deployment oversight."
        primary={{ href: '/sign-up', label: 'Start free' }}
        secondary={{ href: '/contact', label: 'Talk to our team' }}
      />

      {/* Stats */}
      <Section className="py-12">
        <Reveal stagger={0.1} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard value={15} label="Evaluation dimensions" />
          <StatCard value={8} label="Global deployment regions" />
          <StatCard value={8} suffix="+" label="Agent platforms supported" />
          <StatCard value={2024} label="Founded" />
        </Reveal>
      </Section>

      {/* Our story */}
      <Section className="py-12">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <div className="space-y-3">
            <SectionHeading eyebrow="Our story" title="Built from the inside of the problem" />
            <Reveal delay={0.1}>
              <p className="text-sm leading-6 text-slate-400">
                ARIA was not conceived as a product category — it was built to solve a specific operational
                problem that existing tooling consistently failed to address.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200">
                Read the documentation <ArrowRight className="h-4 w-4" />
              </Link>
            </Reveal>
          </div>

          <Reveal delay={0.1} className="article-prose space-y-5 text-sm leading-7">
            <p>
              In 2024, enterprise adoption of conversational AI agents accelerated sharply across financial
              services, healthcare, and contact-centre operations. The infrastructure for deploying these
              systems — Amazon Connect, Lex, Azure Bot Service, and a growing set of custom LLM-backed
              endpoints — was mature and well-supported. The infrastructure for verifying that they behaved
              safely, fairly, and in compliance with regulatory expectations was not.
            </p>
            <p>
              The teams building and operating these agents were using a patchwork of approaches: unit tests
              against isolated intents, manual QA sessions, occasional red-team exercises, and post-incident
              review. Each of these has value in isolation, but none of them produces the continuous,
              structured, auditable signal that production operations and compliance teams actually need.
            </p>
            <p>
              The earliest version of ARIA was an internal evaluation framework built specifically for
              assessing Amazon Connect agents in a financial services context. The key architectural decision
              made early was to use an LLM as the judge, scoring multi-turn transcripts against a structured
              rubric rather than matching against expected outputs. That decision turned out to be the right
              one: it scaled naturally from functional testing to adversarial, bias, and compliance evaluation
              without requiring separate testing infrastructure for each category.
            </p>
            <p>
              ARIA launched as a fully managed SaaS platform in 2026. The product is opinionated: evaluation
              should be continuous, evidence should be auditable, and safety controls should be on by default.
              Those positions come directly from the operational experience that built it.
            </p>
          </Reveal>
        </div>
      </Section>

      {/* Thesis */}
      <Section className="py-12">
        <SectionHeading eyebrow="Our thesis" title="Three things we believe about AI evaluation" />
        <Reveal stagger={0.1} className="mt-12 grid gap-6 md:grid-cols-3">
          {thesis.map((item) => (
            <article key={item.number} className="glass space-y-4 rounded-2xl p-6">
              <span className="font-display text-3xl font-bold tracking-tight text-white/15">{item.number}</span>
              <h3 className="font-display text-base font-semibold leading-6 text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.body}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Principles */}
      <Section className="py-12">
        <SectionHeading
          eyebrow="How we build"
          title="Six operating principles"
          subtitle="These are not values — they are design constraints. Every product decision in ARIA is tested against them."
        />
        <Reveal stagger={0.08} className="mt-12 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {principles.map((item, i) => (
            <article key={item.title} className="glass space-y-3 rounded-2xl p-6">
              <span className="font-display text-2xl font-bold text-cyan-300/40">0{i + 1}</span>
              <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-400">{item.body}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* Timeline */}
      <Section className="py-12">
        <SectionHeading eyebrow="Timeline" title="From internal tool to production platform" />
        <div className="relative mt-12">
          <div className="absolute left-[5.5rem] top-0 hidden h-full w-px bg-gradient-to-b from-cyan-400/40 via-white/10 to-transparent lg:block" aria-hidden="true" />
          <Reveal stagger={0.08} className="space-y-6">
            {milestones.map((item, i) => (
              <article key={item.year + item.quarter} className="relative grid gap-4 lg:grid-cols-[9rem_1fr]">
                <div className="flex items-start gap-3 lg:flex-col lg:gap-1">
                  <span className="font-display text-sm font-bold text-white">{item.year}</span>
                  <span className="text-xs font-medium text-slate-500">{item.quarter}</span>
                  <div className="absolute left-[5.15rem] top-1.5 hidden h-2.5 w-2.5 rounded-full border-2 border-cyan-400 bg-[#05080f] shadow-[0_0_12px_rgba(34,211,238,0.7)] lg:block" aria-hidden="true" />
                </div>
                <div
                  className={`glass rounded-2xl p-5 ${i === milestones.length - 1 ? 'ring-1 ring-cyan-300/30' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
                    {i === milestones.length - 1 && (
                      <span className="shrink-0 rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300 ring-1 ring-cyan-300/30">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{item.detail}</p>
                </div>
              </article>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* What we are / are not */}
      <Section className="py-12">
        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal className="glass space-y-5 rounded-2xl p-6">
            <div className="space-y-2">
              <p className="eyebrow">What ARIA is</p>
              <h2 className="font-display text-xl font-semibold text-white">A dedicated evaluation operating layer</h2>
            </div>
            <ul className="space-y-3">
              {[
                'A continuous evaluation platform, not a one-time audit tool',
                'An LLM-judge framework scoring 15 structured dimensions per transcript',
                'A compliance evidence generator with auditable, exportable run history',
                'A multi-platform adapter connecting to any conversational AI stack',
                'A dedicated-tenant infrastructure with regional data residency',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-sm leading-6 text-slate-300">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={0.1} className="glass space-y-5 rounded-2xl p-6">
            <div className="space-y-2">
              <p className="eyebrow text-rose-300/80">What ARIA is not</p>
              <h2 className="font-display text-xl font-semibold text-white">Important scope boundaries</h2>
            </div>
            <ul className="space-y-3">
              {[
                'Not an agent builder or LLM fine-tuning platform',
                'Not a monitoring tool that reads live production traffic',
                'Not a replacement for human review and regulatory judgement',
                'Not a generic test runner — it is purpose-built for conversational AI evaluation',
                'Not a certification body — it produces evidence for certification, not the certification itself',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                  <span className="text-sm leading-6 text-slate-400">{item}</span>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Start evaluating"
        title="Put evaluation at the centre of your AI delivery pipeline"
        description="The Free plan supports 5 evaluation runs with the full 15-dimension judge. No infrastructure to configure. Results in minutes."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/contact', label: 'Talk to our team' }}
      />
    </div>
  )
}
