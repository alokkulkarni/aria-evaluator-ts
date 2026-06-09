import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Careers at ARIA Evaluator',
  description:
    'Explore open roles at ARIA and help build the platform for secure, governed, production AI operations.',
}

const roles = [
  {
    title: 'Senior Full-Stack Engineer',
    team: 'Product Engineering',
    location: 'Remote (UK/EU preferred)',
    summary:
      'Build customer-facing workflows across evaluation setup, reporting, and collaboration experiences.',
  },
  {
    title: 'Platform Security Engineer',
    team: 'Infrastructure & Security',
    location: 'Remote (UK/EU)',
    summary:
      'Design and operate zero-trust controls, tenant isolation patterns, and security automation for production AI workloads.',
  },
  {
    title: 'Developer Relations Engineer',
    team: 'Product Enablement',
    location: 'Remote (Global)',
    summary:
      'Create technical content, examples, and onboarding pathways that help teams adopt safe AI evaluation practices quickly.',
  },
]

const process = [
  { step: '1. Intro call', detail: '30-minute conversation about background, motivations, and role fit.' },
  { step: '2. Practical interview', detail: 'Hands-on discussion focused on problem-solving and systems thinking.' },
  { step: '3. Team interview', detail: 'Collaborative session with cross-functional teammates you would work with.' },
  { step: '4. Final conversation', detail: 'Leadership and values alignment, followed by a structured offer process.' },
]

const benefits = [
  'Remote-first collaboration with flexible working hours',
  'Meaningful ownership over production systems and product direction',
  'Learning budget for certifications, courses, and conferences',
  'Regular in-person planning sessions and team offsites',
]

export default function CareersPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Careers</p>
          <div className="max-w-4xl space-y-3">
            <h1 className="page-hero-title">Help define how modern teams govern AI in production</h1>
            <p className="page-hero-sub max-w-3xl">
              We are building the operating platform for AI trust, safety, and release readiness. If you care about
              practical impact, strong engineering standards, and responsible AI delivery, we&apos;d love to meet you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="mailto:careers@ariaeval.io?subject=Career%20Application%20-%20ARIA" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Apply now
            </Link>
            <Link href="/about" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              Learn about ARIA
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 xl:grid-cols-3">
        <article className="card">
          <p className="section-label">Why join</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">High-leverage product problems</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            You&apos;ll work on systems that directly affect how organizations evaluate risk, approve releases, and respond to model incidents.
          </p>
        </article>
        <article className="card">
          <p className="section-label">Why join</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Security and reliability at the core</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Our roadmap is deeply technical: zero-trust controls, deterministic workflows, observability, and policy-aligned operations.
          </p>
        </article>
        <article className="card">
          <p className="section-label">Why join</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Ownership with real customer feedback</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Engineers partner directly with users and stakeholders, so decisions are driven by real production needs, not abstraction.
          </p>
        </article>
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="section-label">Open roles</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Current opportunities</h2>
        <div className="mt-6 grid gap-4">
          {roles.map((role) => (
            <article key={role.title} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-slate-900">{role.title}</h3>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200/70">
                  {role.team}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{role.location}</p>
              <p className="mt-3 text-sm leading-6 text-slate-600">{role.summary}</p>
              <div className="mt-4">
                <Link
                  href={`mailto:careers@ariaeval.io?subject=${encodeURIComponent(`Application - ${role.title}`)}`}
                  className="inline-flex items-center rounded-full border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-100"
                >
                  Apply for this role
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <article className="card">
          <p className="section-label">Hiring process</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Transparent and structured</h2>
          <div className="mt-4 space-y-3">
            {process.map((item) => (
              <div key={item.step} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-900">{item.step}</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <p className="section-label">Benefits</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">How we support the team</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            {benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
        </article>
      </section>
    </div>
  )
}
