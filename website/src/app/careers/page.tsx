import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { CtaBand, PageHeader, Section, SectionHeading } from '@/components/marketing/ui'
import { Reveal } from '@/components/motion/Reveal'

export const metadata: Metadata = {
  title: 'Careers at ARIA Evaluator',
  description:
    'Explore open roles at ARIA and help build the platform for secure, governed, production AI operations.',
}

const roles = [
  { title: 'Senior Full-Stack Engineer', team: 'Product Engineering', location: 'Remote (UK/EU preferred)', summary: 'Build customer-facing workflows across evaluation setup, reporting, and collaboration experiences.' },
  { title: 'Platform Security Engineer', team: 'Infrastructure & Security', location: 'Remote (UK/EU)', summary: 'Design and operate zero-trust controls, tenant isolation patterns, and security automation for production AI workloads.' },
  { title: 'Developer Relations Engineer', team: 'Product Enablement', location: 'Remote (Global)', summary: 'Create technical content, examples, and onboarding pathways that help teams adopt safe AI evaluation practices quickly.' },
]

const whyJoin = [
  { title: 'High-leverage product problems', body: "You'll work on systems that directly affect how organizations evaluate risk, approve releases, and respond to model incidents." },
  { title: 'Security and reliability at the core', body: 'Our roadmap is deeply technical: zero-trust controls, deterministic workflows, observability, and policy-aligned operations.' },
  { title: 'Ownership with real customer feedback', body: 'Engineers partner directly with users and stakeholders, so decisions are driven by real production needs, not abstraction.' },
]

const process = [
  { step: '01', title: 'Intro call', detail: '30-minute conversation about background, motivations, and role fit.' },
  { step: '02', title: 'Practical interview', detail: 'Hands-on discussion focused on problem-solving and systems thinking.' },
  { step: '03', title: 'Team interview', detail: 'Collaborative session with cross-functional teammates you would work with.' },
  { step: '04', title: 'Final conversation', detail: 'Leadership and values alignment, followed by a structured offer process.' },
]

const benefits = [
  'Remote-first collaboration with flexible working hours',
  'Meaningful ownership over production systems and product direction',
  'Learning budget for certifications, courses, and conferences',
  'Regular in-person planning sessions and team offsites',
]

export default function CareersPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Careers"
        title="Help define how modern teams govern AI in production"
        description="We are building the operating platform for AI trust, safety, and release readiness. If you care about practical impact, strong engineering standards, and responsible AI delivery, we'd love to meet you."
        primary={{ href: 'mailto:careers@ariaeval.io?subject=Career%20Application%20-%20ARIA', label: 'Apply now' }}
        secondary={{ href: '/about', label: 'Learn about ARIA' }}
      />

      <Section className="py-12">
        <Reveal stagger={0.08} className="grid gap-5 xl:grid-cols-3">
          {whyJoin.map((item) => (
            <article key={item.title} className="glass space-y-2 rounded-2xl p-6">
              <p className="eyebrow">Why join</p>
              <h2 className="font-display text-xl font-semibold text-white">{item.title}</h2>
              <p className="text-sm leading-6 text-slate-400">{item.body}</p>
            </article>
          ))}
        </Reveal>
      </Section>

      <Section className="py-4">
        <div className="glass rounded-[1.75rem] p-8">
          <SectionHeading eyebrow="Open roles" title="Current opportunities" />
          <Reveal stagger={0.08} className="mt-8 grid gap-4">
            {roles.map((role) => (
              <article key={role.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-cyan-300/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-lg font-semibold text-white">{role.title}</h3>
                  <span className="rounded-full bg-blue-400/10 px-3 py-1 text-xs font-semibold text-blue-300 ring-1 ring-blue-300/30">
                    {role.team}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{role.location}</p>
                <p className="mt-3 text-sm leading-6 text-slate-400">{role.summary}</p>
                <a
                  href={`mailto:careers@ariaeval.io?subject=${encodeURIComponent(`Application - ${role.title}`)}`}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  Apply for this role <ArrowRight className="h-4 w-4" />
                </a>
              </article>
            ))}
          </Reveal>
        </div>
      </Section>

      <Section className="py-12">
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <Reveal className="glass rounded-2xl p-6">
            <p className="eyebrow">Hiring process</p>
            <h2 className="mt-2 font-display text-2xl font-semibold text-white">Transparent and structured</h2>
            <div className="mt-5 space-y-3">
              {process.map((item) => (
                <div key={item.step} className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-cyan-300/20 to-blue-400/5 font-display text-xs font-bold text-cyan-200">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-400">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1} className="glass rounded-2xl p-6">
            <p className="eyebrow">Benefits</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">How we support the team</h2>
            <ul className="mt-4 space-y-2.5">
              {benefits.map((benefit) => (
                <li key={benefit} className="flex items-start gap-3 text-sm leading-6 text-slate-400">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-400/70" />
                  {benefit}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </Section>

      <CtaBand
        eyebrow="Don't see your role?"
        title="We're always looking for exceptional people"
        description="Tell us how you'd help teams ship safer AI. Send a note and a few links to your best work."
        primary={{ href: 'mailto:careers@ariaeval.io?subject=General%20Application%20-%20ARIA', label: 'Introduce yourself' }}
        secondary={{ href: '/about', label: 'Our principles' }}
      />
    </div>
  )
}
