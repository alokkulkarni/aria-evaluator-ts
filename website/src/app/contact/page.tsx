import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Contact ARIA Evaluator',
  description:
    'Contact ARIA for enterprise onboarding, security reviews, technical support, and partnership conversations.',
}

const channels = [
  {
    title: 'Sales and onboarding',
    description: 'Scope deployment needs, pricing, and rollout plans with our solutions team.',
    action: 'mailto:sales@ariaeval.io?subject=ARIA%20Evaluator%20Inquiry',
    actionLabel: 'Email sales',
  },
  {
    title: 'Technical support',
    description: 'Get help with setup, integrations, and production troubleshooting.',
    action: 'mailto:support@ariaeval.io?subject=ARIA%20Support%20Request',
    actionLabel: 'Email support',
  },
  {
    title: 'Security and compliance',
    description: 'Request security documentation, architecture reviews, or vendor due diligence material.',
    action: 'mailto:security@ariaeval.io?subject=Security%20Review%20Request',
    actionLabel: 'Contact security',
  },
]

const responseGuidelines = [
  { requestType: 'General inquiry', targetResponse: 'Within 1 business day' },
  { requestType: 'Support request', targetResponse: 'Within 4 business hours' },
  { requestType: 'Security questionnaire', targetResponse: 'Within 2 business days' },
  { requestType: 'Incident escalation', targetResponse: 'Within 1 hour' },
]

export default function ContactPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Contact</p>
          <div className="max-w-4xl space-y-3">
            <h1 className="page-hero-title">Get in touch with the ARIA team</h1>
            <p className="page-hero-sub max-w-3xl">
              Whether you&apos;re evaluating rollout options, planning a pilot, or handling a production incident, we&apos;ll connect
              you with the right team quickly.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="mailto:sales@ariaeval.io?subject=ARIA%20Evaluator%20Inquiry" className="rounded-full bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              Contact sales
            </Link>
            <Link href="/docs" className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
              Read docs first
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-5 lg:grid-cols-3">
        {channels.map((channel) => (
          <article key={channel.title} className="card space-y-3">
            <p className="section-label">Channel</p>
            <h2 className="text-xl font-semibold text-slate-900">{channel.title}</h2>
            <p className="text-sm leading-6 text-slate-600">{channel.description}</p>
            <div>
              <Link href={channel.action} className="inline-flex items-center rounded-full border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50">
                {channel.actionLabel}
              </Link>
            </div>
          </article>
        ))}
      </section>

      <section className="mt-10 grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <article className="card">
          <p className="section-label">How to reach us effectively</p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">Include the right details for faster help</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Your organization name and workspace URL (if available).</li>
            <li>Clear symptom description, expected behavior, and when the issue started.</li>
            <li>Relevant request IDs, screenshots, error messages, or log snippets.</li>
            <li>Business impact level and any active incident timeline requirements.</li>
          </ul>
        </article>

        <article className="card">
          <p className="section-label">Availability</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Coverage windows</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <p><span className="font-medium text-slate-800">Business support:</span> Monday–Friday, 09:00–18:00 UTC</p>
            <p><span className="font-medium text-slate-800">Incident triage:</span> 24/7 for production severity cases</p>
            <p><span className="font-medium text-slate-800">Primary timezone:</span> UK / EU operations</p>
          </div>
        </article>
      </section>

      <section className="mt-10 rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
        <p className="section-label">Response targets</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">Typical response SLAs</h2>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Request type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">Target first response</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {responseGuidelines.map((row) => (
                <tr key={row.requestType}>
                  <td className="px-4 py-3 text-sm text-slate-700">{row.requestType}</td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-900">{row.targetResponse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
