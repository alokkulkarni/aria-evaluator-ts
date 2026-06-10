'use client'

import { AlertTriangle, CheckCircle, CreditCard, FileText, RefreshCw, Shield } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { apiFetch } from '@shared/lib/api'
import { PLANS, formatPlanPrice } from '@/lib/plans'
import type { BillingPeriod, PricingTier } from '@/types'

interface BillingSummary {
  plan: PricingTier | null
  billingPeriod: BillingPeriod | null
  nextBillingDate: string | null
  paymentMethod: { last4: string; brand: string; expMonth: number; expYear: number } | null
  planPrice: number | null
}

interface BillingInvoice {
  id: string
  date: string
  description: string
  amount: number
  currency: string
  status: 'paid' | 'pending' | 'failed'
}

const PLAN_ORDER: PricingTier[] = ['free', 'individual', 'enterprise_starter', 'enterprise_pro', 'enterprise_unlimited']

function planRank(id: PricingTier): number {
  return PLAN_ORDER.indexOf(id)
}

function formatCurrency(amount: number, currency = 'usd'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(amount / 100)
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(iso))
}

export default function BillingPage() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const authToken = session?.user?.accessToken

  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [invoices, setInvoices] = useState<BillingInvoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showPlanPicker, setShowPlanPicker] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<PricingTier | null>(null)
  const [selectedBillingPeriod, setSelectedBillingPeriod] = useState<BillingPeriod>('monthly')
  const [changingPlan, setChangingPlan] = useState(false)
  const [planChangeSuccess, setPlanChangeSuccess] = useState(false)

  const [showCloseAccount, setShowCloseAccount] = useState(false)
  const [closeConfirmEmail, setCloseConfirmEmail] = useState('')
  const [closingAccount, setClosingAccount] = useState(false)
  const [closeError, setCloseError] = useState<string | null>(null)

  const isMounted = useRef(true)
  useEffect(() => {
    isMounted.current = true
    return () => { isMounted.current = false }
  }, [])

  const fetchBilling = useCallback(() => {
    if (!authToken) return
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<BillingSummary>('/billing/summary', { authToken }),
      apiFetch<{ invoices: BillingInvoice[] }>('/billing/history', { authToken }),
    ])
      .then(([s, h]) => {
        if (!isMounted.current) return
        setSummary(s)
        setInvoices(h.invoices)
      })
      .catch(() => {
        if (isMounted.current) setError('Failed to load billing information.')
      })
      .finally(() => {
        if (isMounted.current) setLoading(false)
      })
  }, [authToken])

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.replace('/sign-in')
      return
    }
    if (sessionStatus === 'authenticated') fetchBilling()
  }, [sessionStatus, fetchBilling, router])

  const handleChangePlan = async () => {
    if (!selectedPlan || !authToken) return
    setChangingPlan(true)
    try {
      await apiFetch('/billing/change-plan', {
        method: 'POST',
        authToken,
        body: JSON.stringify({ plan: selectedPlan, billingPeriod: selectedBillingPeriod }),
      })
      setPlanChangeSuccess(true)
      setShowPlanPicker(false)
      fetchBilling()
      setTimeout(() => { if (isMounted.current) setPlanChangeSuccess(false) }, 4000)
    } catch {
      setError('Failed to change plan. Please try again.')
    } finally {
      if (isMounted.current) setChangingPlan(false)
    }
  }

  const handleCloseAccount = async () => {
    if (!authToken) return
    setClosingAccount(true)
    setCloseError(null)
    try {
      await apiFetch('/account', {
        method: 'DELETE',
        authToken,
        body: JSON.stringify({ confirmEmail: closeConfirmEmail }),
      })
      await signOut({ callbackUrl: '/' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to close account. Verify your email is correct.'
      if (isMounted.current) setCloseError(message)
    } finally {
      if (isMounted.current) setClosingAccount(false)
    }
  }

  const currentPlan = PLANS.find((p) => p.id === summary?.plan)
  const currentPlanRank = summary?.plan ? planRank(summary.plan) : -1

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-400">Loading billing…</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <section className="page-hero">
        <div className="space-y-3">
          <p className="page-hero-label">Billing</p>
          <h1 className="page-hero-title">Billing &amp; Subscription</h1>
          <p className="page-hero-sub max-w-2xl">
            Manage your subscription plan, view payment history, update your payment method, or close your account.
          </p>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {planChangeSuccess && (
        <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Your plan has been updated successfully.
        </div>
      )}

      {/* ── Current plan ── */}
      <section className="card space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="section-label">Current plan</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">{currentPlan?.name ?? summary?.plan ?? 'No plan'}</h2>
            <p className="mt-1 text-sm text-slate-500">{currentPlan?.tagline}</p>
          </div>
          {summary?.plan && summary.plan !== 'enterprise_unlimited' && (
            <button
              type="button"
              onClick={() => {
                setSelectedPlan(summary.plan)
                setSelectedBillingPeriod(summary.billingPeriod ?? 'monthly')
                setShowPlanPicker(true)
              }}
              className="btn-secondary rounded-xl shrink-0"
            >
              <RefreshCw className="h-4 w-4" />
              Change plan
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="metric-card">
            <p className="metric-card-label">Monthly price</p>
            <p className="metric-card-value">
              {summary?.planPrice != null && summary.planPrice >= 0
                ? `$${summary.planPrice}/mo`
                : summary?.planPrice === -1 ? 'Contact sales' : '—'}
            </p>
          </div>
          <div className="metric-card">
            <p className="metric-card-label">Billing cadence</p>
            <p className="metric-card-value capitalize">{summary?.billingPeriod ?? '—'}</p>
          </div>
          <div className="metric-card">
            <p className="metric-card-label">Next billing date</p>
            <p className="metric-card-value">{summary?.nextBillingDate ? formatDate(summary.nextBillingDate) : '—'}</p>
          </div>
        </div>
      </section>

      {/* ── Plan picker modal ── */}
      {showPlanPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-slate-900">Change plan</h2>
              <button
                type="button"
                onClick={() => setShowPlanPicker(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <div className="mb-6 flex gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 w-fit">
              {(['monthly', 'annual'] as BillingPeriod[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setSelectedBillingPeriod(period)}
                  className={`rounded-full px-5 py-2 text-sm font-medium transition ${
                    selectedBillingPeriod === period
                      ? 'bg-slate-950 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {period === 'annual' ? 'Annual (save ~17%)' : 'Monthly'}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {PLANS.filter((p) => !p.enterprise).map((plan) => {
                const isCurrentPlan = plan.id === summary?.plan && selectedBillingPeriod === (summary?.billingPeriod ?? 'monthly')
                const isSelected = plan.id === selectedPlan
                const rank = planRank(plan.id)
                const isUpgrade = rank > currentPlanRank
                const isDowngrade = rank < currentPlanRank

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.id)}
                    className={`rounded-2xl border-2 p-4 text-left transition ${
                      isSelected
                        ? 'border-slate-950 bg-slate-950 text-white'
                        : 'border-slate-200 bg-white hover:border-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold ${isSelected ? 'text-white' : 'text-slate-900'}`}>{plan.name}</p>
                      {isCurrentPlan && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">Current</span>}
                      {!isCurrentPlan && isUpgrade && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Upgrade</span>}
                      {!isCurrentPlan && isDowngrade && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">Downgrade</span>}
                    </div>
                    <p className={`mt-1 text-sm ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>{plan.tagline}</p>
                    <p className={`mt-2 text-lg font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {formatPlanPrice(plan, selectedBillingPeriod)}
                    </p>
                  </button>
                )
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowPlanPicker(false)}
                className="btn-secondary flex-1 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleChangePlan}
                disabled={!selectedPlan || changingPlan || (selectedPlan === summary?.plan && selectedBillingPeriod === summary?.billingPeriod)}
                className="btn-primary flex-1 rounded-xl disabled:opacity-50"
              >
                {changingPlan ? 'Updating…' : 'Confirm change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment method ── */}
      <section className="card space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-label">Payment method</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              {summary?.paymentMethod
                ? `${summary.paymentMethod.brand.charAt(0).toUpperCase() + summary.paymentMethod.brand.slice(1)} •••• ${summary.paymentMethod.last4}`
                : 'No payment method on file'}
            </h2>
            {summary?.paymentMethod && (
              <p className="mt-1 text-sm text-slate-500">
                Expires {summary.paymentMethod.expMonth.toString().padStart(2, '0')}/{summary.paymentMethod.expYear}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <CreditCard className="h-8 w-8 text-slate-300" />
            <a
              href="mailto:billing@ariaeval.io?subject=Update payment method"
              className="btn-secondary rounded-xl"
            >
              Update card
            </a>
          </div>
        </div>
        <p className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <Shield className="mb-0.5 mr-1.5 inline h-3.5 w-3.5" />
          Payment processing is handled securely. To update your card, contact billing@ariaeval.io or use the customer portal once it is available.
        </p>
      </section>

      {/* ── Payment history ── */}
      <section className="card space-y-4">
        <div>
          <p className="section-label">Payment history</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Invoices</h2>
        </div>

        {invoices.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No invoices yet. Your payment history will appear here after your first billing cycle.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Description</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-700">{formatDate(inv.date)}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                        {inv.description}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{formatCurrency(inv.amount, inv.currency)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={
                        inv.status === 'paid' ? 'badge-active' :
                        inv.status === 'pending' ? 'badge-pending' : 'badge-error'
                      }>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Danger zone ── */}
      <section className="card space-y-4 border-red-200 bg-red-50/30">
        <div>
          <p className="section-label text-red-600">Danger zone</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">Close account</h2>
          <p className="mt-2 text-sm text-slate-600">
            Permanently delete your account and workspace. All data, evaluations, and configurations will be irreversibly removed. This cannot be undone.
          </p>
        </div>
        {!showCloseAccount ? (
          <button
            type="button"
            onClick={() => setShowCloseAccount(true)}
            className="rounded-xl border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-50 hover:border-red-400"
          >
            Close account &amp; delete workspace
          </button>
        ) : (
          <div className="space-y-4 rounded-2xl border border-red-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-900">
              To confirm, enter your account email address:&nbsp;
              <span className="font-mono text-slate-600">{session?.user?.email}</span>
            </p>
            <input
              type="email"
              value={closeConfirmEmail}
              onChange={(e) => setCloseConfirmEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
            />
            {closeError && (
              <p className="text-xs text-red-600">{closeError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowCloseAccount(false); setCloseConfirmEmail(''); setCloseError(null) }}
                className="btn-secondary flex-1 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseAccount}
                disabled={closingAccount || closeConfirmEmail.toLowerCase() !== session?.user?.email?.toLowerCase()}
                className="flex-1 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {closingAccount ? 'Closing account…' : 'Permanently close account'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
