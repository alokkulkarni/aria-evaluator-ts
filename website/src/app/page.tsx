import Link from 'next/link'
import { BarChart3, Globe, Shield, Zap } from 'lucide-react'

import { Features } from '@/components/marketing/Features'
import { formatPlanPrice, getPlanById } from '@/lib/plans'

const heroPills = ['SOC 2 Type II', 'GDPR Compliant', 'ISO 27001', '8 Global Regions']
const quickFeatures = [
  { icon: Shield, title: 'Adversarial Security Testing', description: 'Stress-test agents with reproducible attack suites and policy checks.' },
  { icon: Zap, title: 'Multi-Model Evaluation', description: 'Compare providers, prompts, and policies across every release.' },
  { icon: Globe, title: 'Global Deployment', description: 'Deploy dedicated evaluation workspaces in the regions your teams require.' },
  { icon: BarChart3, title: 'Real-time Observability', description: 'Monitor usage, traces, and scenario outcomes from a single command center.' },
]
const trustedLogos = ['Acme Corp', 'BetaTech', 'Northstar AI', 'Helios Systems', 'Quantum Ridge', 'Monarch Labs']
const previewPlans = ['individual', 'enterprise_pro', 'enterprise_unlimited'] as const

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.2),transparent_30%)]" />
        <div className="relative max-w-8xl mx-auto grid min-h-[85vh] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="flex flex-col justify-center space-y-8">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Enterprise AI Safety Evaluation</p>
              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-bold tracking-tight text-white sm:text-7xl">
                  Evaluate AI Agents. At Enterprise Scale.
                </h1>
                <p className="max-w-2xl text-xl leading-8 text-slate-300/90">
                  Launch dedicated evaluation workspaces, run adversarial test suites, and track model quality with observability built for enterprise AI teams.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                Start for free
              </Link>
              <Link href="/pricing" className="rounded-full border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
                View pricing
              </Link>
            </div>

            <div className="flex flex-wrap gap-3">
              {heroPills.map((pill) => (
                <span key={pill} className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10 text-xs text-slate-100/90">
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center lg:justify-end">
            <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-white/5 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.35)] backdrop-blur-xl">
              <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Observability cockpit</p>
                    <h2 className="mt-2 text-2xl font-semibold">Workspace health</h2>
                  </div>
                  <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-300/20">Healthy</span>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Active runs</p>
                    <p className="mt-2 text-2xl font-semibold">742</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Regions</p>
                    <p className="mt-2 text-2xl font-semibold">8</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-300">Models</p>
                    <p className="mt-2 text-2xl font-semibold">10+</p>
                  </div>
                </div>

                <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <span>Evaluation queue</span>
                    <span>86% processed</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10">
                    <div className="h-2 w-[86%] rounded-full bg-cyan-400" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-300">Latency trend</p>
                      <p className="mt-2 text-lg font-semibold text-white">-14%</p>
                    </div>
                    <div className="rounded-2xl bg-white/5 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-300">Security findings</p>
                      <p className="mt-2 text-lg font-semibold text-white">2 blocked</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-8xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {quickFeatures.map(({ icon: Icon, title, description }) => (
            <article key={title} className="card space-y-4">
              <div className="inline-flex rounded-2xl bg-slate-950 p-3 text-cyan-300 shadow-[0_12px_30px_rgba(15,23,42,0.18)]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                <p className="text-sm leading-6 text-slate-600">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Features />

      <section className="max-w-8xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl space-y-4">
          <p className="section-label">How it works</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">From sign-up to full-scale evaluation in minutes</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            { step: '1', title: 'Sign up', description: 'Create your ARIA account with secure onboarding for engineering and security teams.' },
            { step: '2', title: 'Choose region', description: 'Select the deployment region that matches your compliance and latency needs.' },
            { step: '3', title: 'Configure', description: 'Set your plan, team access, and observability preferences from one workflow.' },
            { step: '4', title: 'Evaluate', description: 'Launch scenarios, compare models, and review results with traceable insights.' },
          ].map((item) => (
            <article key={item.step} className="card space-y-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-950 text-sm font-semibold text-white">{item.step}</span>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-slate-900">{item.title}</h3>
                <p className="text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white/70">
        <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          <p className="section-label text-center">Trusted by forward-looking teams</p>
          <div className="mt-8 grid gap-4 text-center text-lg font-semibold tracking-[0.2em] text-slate-400 sm:grid-cols-3 lg:grid-cols-6">
            {trustedLogos.map((logo) => (
              <div key={logo} className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-5">
                {logo}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-8xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="section-label">Pricing preview</p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Start small, then scale into dedicated enterprise infrastructure.</h2>
          </div>
          <Link href="/pricing" className="btn-secondary rounded-xl">
            View full pricing
          </Link>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {previewPlans.map((id) => {
            const plan = getPlanById(id)
            if (!plan) return null

            return (
              <article key={plan.id} className="card flex h-full flex-col justify-between gap-6">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                  </div>
                  <div>
                    <p className="text-4xl font-bold tracking-tight text-slate-900">{formatPlanPrice(plan, 'monthly')}</p>
                    <p className="mt-2 text-sm text-slate-500">Flexible onboarding with region-aware deployment.</p>
                  </div>
                  <ul className="space-y-2 text-sm text-slate-600">
                    {plan.features.slice(0, 4).map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <span className="mt-1 h-2 w-2 rounded-full bg-cyan-500" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Link href={`/sign-up?plan=${plan.id}`} className="btn-primary justify-center rounded-xl">
                  {plan.id === 'enterprise_unlimited' ? 'Contact sales' : 'Get started'}
                </Link>
              </article>
            )
          })}
        </div>
      </section>

      <section className="max-w-8xl mx-auto px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-10 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Ready to launch</p>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Ready to evaluate your AI?</h2>
              <p className="text-sm leading-6 text-slate-200/80">
                Create your ARIA workspace, pick a region, and start shipping safer AI releases with confidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/sign-up" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
                Start for free
              </Link>
              <Link href="/pricing" className="rounded-full border border-white/10 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
                Compare plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
