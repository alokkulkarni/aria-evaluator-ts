import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = {
  title: 'About — ARIA Evaluator',
  description:
    'ARIA Evaluator was built to close the gap between deploying conversational AI agents and being confident they are safe, compliant, and reliable in production.',
}

// ── Data ─────────────────────────────────────────────────────────────────────

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

const stats = [
  { value: '15',              label: 'Evaluation dimensions' },
  { value: '8',               label: 'Global deployment regions' },
  { value: '8+',              label: 'Agent platforms supported' },
  { value: '2024',            label: 'Founded' },
]

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-16">

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">About ARIA Evaluator</p>
          <div className="max-w-4xl space-y-3">
            <h1 className="page-hero-title">
              Built to close the gap between deploying AI and being confident it is safe
            </h1>
            <p className="page-hero-sub max-w-3xl">
              ARIA Evaluator gives engineering, security, and governance teams one operating layer for AI
              agent testing, release controls, compliance evidence, and post-deployment oversight.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Start free
            </Link>
            <Link href="/contact" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              Talk to our team
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200/80 bg-white/90 px-6 py-5 shadow-sm">
            <p className="text-4xl font-bold tracking-tight text-slate-900">{s.value}</p>
            <p className="mt-1 text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ── Our story ─────────────────────────────────────────────────────── */}
      <section className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <div className="space-y-3">
          <p className="section-label">Our story</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Built from the inside of the problem
          </h2>
          <p className="text-sm leading-6 text-slate-500">
            ARIA was not conceived as a product category — it was built to solve a specific operational
            problem that existing tooling consistently failed to address.
          </p>
          <Link href="/docs" className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700">
            Read the documentation <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="article-prose space-y-5 text-sm leading-7 text-slate-700">
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
            assessing Amazon Connect agents in a financial services context. The focus was narrow and
            deliberate: adversarial scenarios, guardrail verification, and escalation compliance — the
            failure modes that carry the most regulatory risk but are hardest to catch with standard
            testing approaches. The key architectural decision made early was to use an LLM as the judge,
            scoring multi-turn transcripts against a structured rubric rather than matching against
            expected outputs. That decision turned out to be the right one: it scaled naturally from
            functional testing to adversarial, bias, and compliance evaluation without requiring separate
            testing infrastructure for each category.
          </p>
          <p>
            The platform expanded from there. Platform-agnostic adapters, a 15-dimension evaluation model,
            a human review queue for regulated-industry sign-off, and a tenant-isolated deployment
            architecture. The decision to build for multi-tenancy from the ground up — dedicated
            infrastructure per customer, regional data residency, no shared compute — reflected the
            requirements of the customers this was always intended to serve: teams in regulated industries
            where data handling and audit evidence are not optional.
          </p>
          <p>
            ARIA launched as a fully managed SaaS platform in 2026. The product is opinionated: evaluation
            should be continuous, evidence should be auditable, and safety controls should be on by default.
            Those positions come directly from the operational experience that built it.
          </p>
        </div>
      </section>

      {/* ── Thesis ────────────────────────────────────────────────────────── */}
      <section className="rounded-3xl border border-slate-200/80 bg-slate-950 px-8 py-10 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="max-w-3xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">Our thesis</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Three things we believe about AI evaluation
          </h2>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {thesis.map((item) => (
            <article key={item.number} className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6">
              <span className="text-3xl font-bold tracking-tight text-white/20">{item.number}</span>
              <h3 className="text-base font-semibold leading-6 text-white">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-300/90">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Principles ────────────────────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="max-w-3xl space-y-3">
          <p className="section-label">How we build</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Six operating principles
          </h2>
          <p className="text-base leading-7 text-slate-600">
            These are not values — they are design constraints. Every product decision in ARIA is
            tested against them.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {principles.map((item, i) => (
            <article key={item.title} className="card space-y-3">
              <span className="text-2xl font-bold text-slate-100">0{i + 1}</span>
              <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="text-sm leading-6 text-slate-600">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── Timeline ──────────────────────────────────────────────────────── */}
      <section className="space-y-8">
        <div className="max-w-3xl space-y-3">
          <p className="section-label">Timeline</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            From internal tool to production platform
          </h2>
        </div>

        <div className="relative">
          {/* vertical rule */}
          <div className="absolute left-[5.5rem] top-0 hidden h-full w-px bg-slate-200 lg:block" aria-hidden="true" />

          <div className="space-y-6">
            {milestones.map((item, i) => (
              <article key={item.year + item.quarter} className="relative grid gap-4 lg:grid-cols-[9rem_1fr]">
                <div className="flex items-start gap-3 lg:flex-col lg:gap-1">
                  <span className="text-sm font-bold text-slate-900">{item.year}</span>
                  <span className="text-xs font-medium text-slate-400">{item.quarter}</span>
                  {/* timeline dot */}
                  <div className="absolute left-[5.15rem] top-1.5 hidden h-2.5 w-2.5 rounded-full border-2 border-blue-600 bg-white lg:block" aria-hidden="true" />
                </div>
                <div className={`rounded-2xl border bg-white/90 p-5 shadow-sm ${i === milestones.length - 1 ? 'border-blue-200 ring-2 ring-blue-500/10' : 'border-slate-200/80'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                    {i === milestones.length - 1 && (
                      <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── What we are not ───────────────────────────────────────────────── */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-5">
          <div className="space-y-2">
            <p className="section-label">What ARIA is</p>
            <h2 className="text-xl font-semibold text-slate-900">A dedicated evaluation operating layer</h2>
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
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span className="text-sm leading-6 text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card space-y-5 border-slate-100 bg-slate-50/80">
          <div className="space-y-2">
            <p className="section-label text-rose-600">What ARIA is not</p>
            <h2 className="text-xl font-semibold text-slate-900">Important scope boundaries</h2>
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
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                <span className="text-sm leading-6 text-slate-600">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section>
        <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-10 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Start evaluating</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Put evaluation at the centre of your AI delivery pipeline
              </h2>
              <p className="text-sm leading-6 text-slate-200/80">
                The Free plan supports 5 evaluation runs with the full 15-dimension judge.
                No infrastructure to configure. Results in minutes.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                className="rounded-full bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                Start for free
              </Link>
              <Link
                href="/contact"
                className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white"
              >
                Talk to our team
              </Link>
            </div>
          </div>
        </div>
      </section>

    </div>
  )
}
