import Link from 'next/link'
import { ArrowRight, BarChart3, Globe, Shield, Zap } from 'lucide-react'

import { Features } from '@/components/marketing/Features'
import { FeatureCard } from '@/components/marketing/FeatureCard'
import { CtaBand, Section, SectionHeading, StatCard } from '@/components/marketing/ui'
import { CountUp } from '@/components/motion/CountUp'
import { MagneticButton } from '@/components/motion/MagneticButton'
import { Marquee } from '@/components/motion/Marquee'
import { Reveal } from '@/components/motion/Reveal'
import { RevealText } from '@/components/motion/RevealText'
import { TiltCard } from '@/components/motion/TiltCard'
import { HeroCanvas } from '@/components/three/HeroCanvas'
import { formatPlanPrice, getPlanById } from '@/lib/plans'

const heroPills = [
  { label: 'SOC 2 Type II', status: 'pursuing' },
  { label: 'GDPR Aligned', status: 'pursuing' },
  { label: 'ISO 27001', status: 'pursuing' },
  { label: '8 Global Regions', status: 'live' },
] as const

const quickFeatures = [
  { icon: Shield, title: 'Adversarial Security Testing', description: 'Stress-test agents with prompt-injection, jailbreak, and social-engineering suites.' },
  { icon: Zap, title: '15-Dimension LLM Judge', description: 'Score every conversation for quality, safety, compliance, and escalation handling.' },
  { icon: Globe, title: 'Any Agent Platform', description: 'Amazon Connect, Lex, Azure, Copilot, OpenAPI, WebSocket — plug in and evaluate.' },
  { icon: BarChart3, title: 'Real-time Observability', description: 'Monitor live runs, transcripts, and scenario outcomes from a single command center.' },
]

const standards = ['OWASP LLM Top 10', 'NIST AI RMF', 'MITRE ATLAS', 'EU AI Act', 'FCA Consumer Duty', 'ISO 27001', 'SOC 2', 'HIPAA', 'GDPR', 'PCI DSS']

const dimensionGroups = [
  { category: 'Response Quality', count: 5, tone: 'bg-cyan-400', glow: 'shadow-[0_0_12px_rgba(34,211,238,0.8)]', dimensions: ['Correctness', 'Faithfulness', 'Helpfulness', 'Relevance', 'Conciseness'] },
  { category: 'Task Completion', count: 2, tone: 'bg-blue-400', glow: 'shadow-[0_0_12px_rgba(59,130,246,0.8)]', dimensions: ['Goal Success', 'Task Completion Rate'] },
  { category: 'Safety & Security', count: 3, tone: 'bg-rose-400', glow: 'shadow-[0_0_12px_rgba(244,63,94,0.8)]', dimensions: ['Guardrail Compliance', 'Prompt Injection Resistance', 'Bias & Fairness'] },
  { category: 'Customer Experience', count: 2, tone: 'bg-emerald-400', glow: 'shadow-[0_0_12px_rgba(52,211,153,0.8)]', dimensions: ['Tone & Empathy', 'Clarity'] },
  { category: 'Escalation & Vulnerability', count: 3, tone: 'bg-amber-400', glow: 'shadow-[0_0_12px_rgba(251,191,36,0.8)]', dimensions: ['Escalation Appropriateness', 'Handover Quality', 'Vulnerability Detection'] },
]

const supportedPlatforms = [
  { name: 'Amazon Connect', detail: 'Voice & chat flows' },
  { name: 'Amazon Lex', detail: 'V2 bots' },
  { name: 'Azure Bot Service', detail: 'Direct Line channel' },
  { name: 'Microsoft Copilot', detail: 'Copilot Studio agents' },
  { name: 'OpenAPI / REST', detail: 'Any HTTP endpoint' },
  { name: 'WebSocket', detail: 'Custom chat bots' },
]

const previewPlans = ['free', 'individual', 'enterprise_starter'] as const

const showcaseRuns = [
  { label: 'Adversarial coverage', value: 96, suffix: '%', tone: 'bg-emerald-400' },
  { label: 'Judge agreement', value: 92, suffix: '%', tone: 'bg-cyan-400' },
  { label: 'Policy violations blocked', value: 18, suffix: '', tone: 'bg-amber-400' },
]

const showcaseRegions = [
  { name: 'UK London', code: 'eu-west-2', status: 'Primary' },
  { name: 'US East', code: 'us-east-1', status: 'Active' },
  { name: 'Frankfurt', code: 'eu-central-1', status: 'Ready' },
]

const steps = [
  { step: '01', title: 'Sign up', description: 'Create your ARIA account with secure onboarding for engineering and security teams.' },
  { step: '02', title: 'Choose region', description: 'Select the deployment region that matches your compliance and latency needs.' },
  { step: '03', title: 'Connect', description: 'Point an adapter at your agent — Connect, Lex, Azure, Copilot, or any HTTP endpoint.' },
  { step: '04', title: 'Evaluate', description: 'Launch scenario runs, watch transcripts live, and review 15-dimension judge scores.' },
]

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden">
        <HeroCanvas className="absolute inset-0 -z-10" />
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_70%_30%,transparent,rgba(5,8,15,0.65))]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-48 bg-gradient-to-b from-transparent to-[#05080f]" />

        <div className="max-w-8xl mx-auto grid min-h-[92vh] items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
          <div>
            <Reveal>
              <span className="eyebrow rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                  <span className="relative h-1.5 w-1.5 rounded-full bg-cyan-400" />
                </span>
                Enterprise AI Safety Evaluation
              </span>
            </Reveal>

            <h1 className="mt-6 font-display text-5xl font-bold leading-[1.02] tracking-tight text-white sm:text-7xl">
              <RevealText as="span" text="Evaluate AI Agents." className="block" />
              <RevealText as="span" text="At Enterprise Scale." className="block" gradient stagger={0.06} />
            </h1>

            <Reveal delay={0.15}>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300/90">
                Launch dedicated evaluation workspaces, run adversarial test suites, and track model
                quality with observability built for enterprise AI teams.
              </p>
            </Reveal>

            <Reveal delay={0.25}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <MagneticButton
                  href="/sign-up"
                  className="group items-center justify-center gap-2 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_16px_44px_-12px_rgba(34,211,238,0.7)] transition hover:brightness-110"
                >
                  Start for free
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </MagneticButton>
                <Link
                  href="/pricing"
                  className="rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 backdrop-blur transition hover:border-white/30 hover:bg-white/10"
                >
                  View pricing
                </Link>
              </div>
            </Reveal>

            <Reveal delay={0.35}>
              <div className="mt-8 flex flex-wrap gap-2.5">
                {heroPills.map((pill) => (
                  <span
                    key={pill.label}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 backdrop-blur"
                  >
                    {pill.status === 'live' ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    ) : (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                        <span className="relative h-1.5 w-1.5 rounded-full bg-amber-400" />
                      </span>
                    )}
                    {pill.label}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          {/* Floating observability cockpit */}
          <Reveal delay={0.3} className="hidden lg:block">
            <div className="animate-float-y">
              <TiltCard max={6} className="rounded-[2rem]">
                <div className="ring-conic glass-strong relative overflow-hidden rounded-[2rem] p-5">
                  <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="eyebrow">Observability cockpit</p>
                        <h2 className="mt-2 font-display text-2xl font-semibold text-white">Workspace health</h2>
                      </div>
                      <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/30">
                        Healthy
                      </span>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Active runs</p>
                        <CountUp value={742} separator className="mt-2 block font-display text-2xl font-semibold text-white" />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Regions</p>
                        <CountUp value={8} className="mt-2 block font-display text-2xl font-semibold text-white" />
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <p className="text-xs uppercase tracking-wide text-slate-400">Models</p>
                        <CountUp value={10} suffix="+" className="mt-2 block font-display text-2xl font-semibold text-white" />
                      </div>
                    </div>

                    <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between text-sm text-slate-200">
                        <span>Evaluation queue</span>
                        <span>86% processed</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div className="h-2 w-[86%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 shadow-[0_0_16px_rgba(34,211,238,0.6)]" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-wide text-slate-400">Latency trend</p>
                          <p className="mt-2 text-lg font-semibold text-emerald-300">-14%</p>
                        </div>
                        <div className="rounded-2xl bg-white/5 p-3">
                          <p className="text-xs uppercase tracking-wide text-slate-400">Security findings</p>
                          <p className="mt-2 text-lg font-semibold text-white">2 blocked</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </div>
          </Reveal>
        </div>

        {/* scroll cue */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-slate-500 lg:flex">
          <span className="text-[10px] uppercase tracking-[0.3em]">Scroll</span>
          <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/15 p-1">
            <span className="h-2 w-1 animate-float-y rounded-full bg-cyan-300" />
          </span>
        </div>
      </section>

      {/* ── Standards marquee ────────────────────────────────────────────────── */}
      <Section className="py-12">
        <Reveal>
          <p className="mb-6 text-center text-xs uppercase tracking-[0.28em] text-slate-500">
            Built around the standards that matter
          </p>
        </Reveal>
        <Marquee gapClassName="gap-3">
          {standards.map((s) => (
            <span
              key={s}
              className="whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-sm font-medium text-slate-300"
            >
              {s}
            </span>
          ))}
        </Marquee>
      </Section>

      {/* ── Quick features ───────────────────────────────────────────────────── */}
      <Section className="py-10">
        <Reveal stagger={0.08} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {quickFeatures.map(({ icon, title, description }) => (
            <FeatureCard key={title} icon={icon} title={title} description={description} />
          ))}
        </Reveal>
      </Section>

      {/* ── Stats band ───────────────────────────────────────────────────────── */}
      <Section className="py-10">
        <Reveal stagger={0.1} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard value={15} label="Evaluation dimensions" />
          <StatCard value={8} label="Global deployment regions" />
          <StatCard value={8} suffix="+" label="Agent platforms supported" />
          <StatCard value={99.9} decimals={1} suffix="%" label="Tenant isolation, by design" />
        </Reveal>
      </Section>

      {/* ── Platform showcase ────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Platform showcase"
          title="See the main ARIA workspace before you sign up"
          subtitle="Give buyers and engineering teams an immediate feel for the platform — scenario coverage, judge confidence, and region-aware deployment controls."
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal className="h-full">
            <article className="glass relative h-full overflow-hidden rounded-[1.75rem]">
              <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
                <span className="ml-3 text-xs text-slate-500">release-readiness.aria</span>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="eyebrow">Executive summary</p>
                      <h3 className="mt-1 font-display text-base font-semibold text-white">Release readiness snapshot</h3>
                    </div>
                    <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/30">
                      Ship candidate
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    {showcaseRuns.map((item) => (
                      <div key={item.label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{item.label}</p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full ${item.tone}`} />
                          <CountUp value={item.value} suffix={item.suffix} className="font-display text-lg font-semibold text-white" />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Scenario pack completeness</span>
                      <span className="font-semibold text-white">43 / 45 critical tests</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-1.5 w-[95%] rounded-full bg-gradient-to-r from-cyan-400 to-blue-400" />
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="eyebrow">Judge comparison</p>
                    <h3 className="mt-1 text-sm font-semibold text-white">Consensus by scenario type</h3>
                    <div className="mt-3 space-y-2.5">
                      {[
                        { label: 'Functional', score: 94, color: 'from-emerald-400 to-emerald-300' },
                        { label: 'Adversarial', score: 88, color: 'from-cyan-400 to-blue-400' },
                        { label: 'Escalation', score: 91, color: 'from-blue-400 to-indigo-400' },
                      ].map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="text-slate-400">{item.label}</span>
                            <span className="font-semibold text-white">{item.score}%</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-1.5 rounded-full bg-gradient-to-r ${item.color}`} style={{ width: `${item.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <p className="eyebrow">Region controls</p>
                    <h3 className="mt-1 text-sm font-semibold text-white">Tenant isolation</h3>
                    <div className="mt-3 space-y-2">
                      {showcaseRegions.map((region) => (
                        <div key={region.code} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                          <div>
                            <p className="text-xs font-semibold text-white">{region.name}</p>
                            <p className="text-[10px] text-slate-500">{region.code}</p>
                          </div>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-200">
                            {region.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </article>
          </Reveal>

          <Reveal delay={0.1} className="h-full">
            <div className="glass relative flex h-full min-h-[320px] flex-col overflow-hidden rounded-[1.75rem]">
              <div className="relative flex-1 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.24),transparent_36%)]">
                <video
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  aria-label="ARIA Evaluator product reel"
                >
                  <source src="/videos/homepage-product-reel.mp4" type="video/mp4" />
                </video>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05080f]/40 via-transparent to-[#05080f]/20" />
                <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/65 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-200 backdrop-blur">
                  Product walkthrough
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Section>

      {/* ── 15 dimensions ────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Evaluation engine"
          title="Every conversation, scored across 15 dimensions"
          subtitle="ARIA's LLM judge evaluates each transcript against a structured rubric — not a single pass/fail. Security scenarios are scored on guardrail compliance; quality scenarios on the full dimension set, with per-dimension justifications you can audit."
        />

        <Reveal stagger={0.08} className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {dimensionGroups.map((group) => (
            <article key={group.category} className="glass group rounded-2xl p-5 transition-colors hover:border-cyan-300/30">
              <div className="flex items-center justify-between gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${group.tone} ${group.glow}`} />
                <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                  {group.count} {group.count === 1 ? 'dimension' : 'dimensions'}
                </span>
              </div>
              <h3 className="mt-4 font-display text-sm font-semibold text-white">{group.category}</h3>
              <ul className="mt-3 space-y-2">
                {group.dimensions.map((dimension) => (
                  <li key={dimension} className="flex items-center gap-2 text-xs leading-5 text-slate-400">
                    <span className="h-1 w-1 rounded-full bg-slate-600" />
                    {dimension}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </Reveal>
      </Section>

      <Features />

      {/* ── Integrations ─────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="Integrations"
          title="Works with the agent platform you already run"
          subtitle="Pluggable adapters connect ARIA to your agent under test — no instrumentation or SDK changes required. The OpenAPI and WebSocket adapters cover any custom endpoint."
        />

        <Reveal stagger={0.07} className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supportedPlatforms.map((platform) => (
            <article key={platform.name} className="glass flex items-center justify-between gap-4 rounded-2xl p-5 transition-colors hover:border-cyan-300/30">
              <div>
                <h3 className="font-display text-base font-semibold text-white">{platform.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{platform.detail}</p>
              </div>
              <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-300/30">
                Supported
              </span>
            </article>
          ))}
        </Reveal>
      </Section>

      {/* ── How it works ─────────────────────────────────────────────────────── */}
      <Section>
        <SectionHeading
          eyebrow="How it works"
          title="From sign-up to full-scale evaluation in minutes"
        />

        <div className="relative mt-12">
          <div className="pointer-events-none absolute left-0 top-7 hidden h-px w-full bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent xl:block" />
          <Reveal stagger={0.1} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {steps.map((item) => (
              <article key={item.step} className="glass relative rounded-2xl p-6">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/20 to-blue-400/5 font-display text-sm font-bold text-cyan-200">
                  {item.step}
                </span>
                <h3 className="mt-4 font-display text-xl font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.description}</p>
              </article>
            ))}
          </Reveal>
        </div>
      </Section>

      {/* ── Pricing preview ──────────────────────────────────────────────────── */}
      <Section>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading
            eyebrow="Pricing preview"
            title="Start small, then scale into dedicated infrastructure"
          />
          <Reveal delay={0.1}>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
            >
              View full pricing <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>

        <Reveal stagger={0.1} className="mt-12 grid gap-5 lg:grid-cols-3">
          {previewPlans.map((id) => {
            const plan = getPlanById(id)
            if (!plan) return null
            return (
              <article key={plan.id} className="glass flex h-full flex-col justify-between gap-6 rounded-2xl p-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="font-display text-xl font-semibold text-white">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
                  </div>
                  <p className="font-display text-4xl font-bold tracking-tight text-white">
                    {formatPlanPrice(plan, 'monthly')}
                  </p>
                  <ul className="space-y-2 text-sm text-slate-400">
                    {plan.features.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  href={`/sign-up?plan=${plan.id}`}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                >
                  {plan.id === 'enterprise_unlimited' ? 'Contact sales' : 'Get started'}
                </Link>
              </article>
            )
          })}
        </Reveal>
      </Section>

      {/* ── Final CTA ────────────────────────────────────────────────────────── */}
      <CtaBand
        eyebrow="Ready to launch"
        title="Ready to evaluate your AI?"
        description="Create your ARIA workspace, pick a region, and start shipping safer AI releases with confidence."
        primary={{ href: '/sign-up', label: 'Start for free' }}
        secondary={{ href: '/pricing', label: 'Compare plans' }}
      />
    </div>
  )
}
