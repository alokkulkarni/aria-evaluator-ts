import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'About ARIA Evaluator',
  description:
    'Learn how ARIA helps security, risk, and engineering teams ship trustworthy AI through continuous evaluation, governance, and observability.',
}

const principles = [
  {
    title: 'Safety-by-default product design',
    description:
      'We build controls directly into evaluation workflows so responsible delivery is the easiest path for teams.',
  },
  {
    title: 'Operator-grade reliability',
    description:
      'Platform behavior is designed for real production environments: alerts, auditability, regional resilience, and clear ownership.',
  },
  {
    title: 'Practical governance, not paperwork',
    description:
      'We translate policy intent into actionable checks so product and compliance teams can move together instead of in conflict.',
  },
]

const milestones = [
  { year: '2024', title: 'Internal platform foundation', detail: 'Built our first evaluator workflow engine focused on adversarial and bias testing for enterprise teams.' },
  { year: '2025', title: 'Control plane and tenant model', detail: 'Introduced tenant-aware deployment, automated instance lifecycle management, and role-based workflows.' },
  { year: '2026', title: 'Production readiness program', detail: 'Expanded zero-trust security controls, audit evidence capture, and operational playbooks for regulated environments.' },
]

const facts = [
  { label: 'Deployment model', value: 'Dedicated tenant isolation' },
  { label: 'Core audience', value: 'Security, risk, and platform teams' },
  { label: 'Evaluation coverage', value: 'Bias, adversarial, safety, and reliability' },
  { label: 'Operating model', value: 'Continuous pre-release + runtime checks' },
]

export default function AboutPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Company</p>
          <div className="max-w-4xl space-y-3">
            <h1 className="page-hero-title">We help teams ship trustworthy AI at production speed</h1>
            <p className="page-hero-sub max-w-3xl">
              ARIA Evaluator gives engineering, security, and governance teams one operating layer for AI risk testing,
              release controls, and post-deployment oversight.
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

      <section className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {facts.map((fact) => (
          <article key={fact.label} className="metric-card">
            <p className="metric-card-label">{fact.label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{fact.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-5 xl:grid-cols-3">
        {principles.map((item) => (
          <article key={item.title} className="card space-y-2">
            <p className="section-label">Principle</p>
            <h2 className="text-xl font-semibold text-slate-900">{item.title}</h2>
            <p className="text-sm leading-6 text-slate-600">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="section-label">Milestones</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">How ARIA has evolved</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {milestones.map((item) => (
            <article key={item.year + item.title} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-700">{item.year}</p>
              <h3 className="mt-2 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 card bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950 text-white">
        <div className="space-y-3">
          <p className="section-label text-cyan-300">Our focus</p>
          <h2 className="text-2xl font-semibold">Build safer systems, without slowing product teams down</h2>
          <p className="max-w-3xl text-sm leading-6 text-slate-200">
            We are opinionated about practical security and measurable outcomes. That means reproducible scenarios,
            transparent scoring, and clear accountability from experiment through production operations.
          </p>
          <div className="pt-2">
            <Link href="/docs" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Explore platform docs
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
