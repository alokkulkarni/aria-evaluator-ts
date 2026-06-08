import { MOCK_NEXT_BILLING } from '@/lib/mock-data'
import { getPlanById } from '@/lib/plans'

const plan = getPlanById('enterprise_starter')
const nextBilling = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(MOCK_NEXT_BILLING))

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <section className="page-hero">
        <div className="space-y-3">
          <p className="page-hero-label">Billing</p>
          <h1 className="page-hero-title">Billing and subscription</h1>
          <p className="page-hero-sub max-w-2xl">
            Review your current plan and prepare for upgrades as billing self-service rolls out.
          </p>
        </div>
      </section>

      <section className="card space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-label">Current plan</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{plan?.name ?? 'Enterprise Starter'}</h2>
            <p className="mt-2 text-sm text-slate-600">{plan?.tagline}</p>
          </div>
          <button type="button" className="btn-secondary rounded-xl opacity-70" disabled>
            Upgrade plan
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="metric-card">
            <p className="metric-card-label">Monthly price</p>
            <p className="metric-card-value">$299/mo</p>
          </div>
          <div className="metric-card">
            <p className="metric-card-label">Billing cadence</p>
            <p className="metric-card-value">Monthly</p>
          </div>
          <div className="metric-card">
            <p className="metric-card-label">Next billing</p>
            <p className="metric-card-value">{nextBilling}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
          Billing management coming soon — contact support@ariaeval.io
        </div>
      </section>
    </div>
  )
}
