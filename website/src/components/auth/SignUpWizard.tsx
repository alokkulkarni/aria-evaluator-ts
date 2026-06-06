'use client'

import { z } from 'zod'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Github, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'

import { createSSOToken, createTenant, registerUser } from '@/lib/api'
import { getPlanById, PLANS } from '@/lib/plans'
import { getRegionById, getRegionsForTier, REGIONS } from '@/lib/regions'
import { cn } from '@/lib/utils'
import { RegionPicker } from '@/components/shared/RegionPicker'
import type { BillingPeriod, PricingTier, SignUpState } from '@/types'

const accountSchema = z
  .object({
    name: z.string().min(2, 'Enter your full name'),
    company: z.string().optional(),
    email: z.string().email('Enter a valid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })

const steps = [
  { id: 1, label: 'Account' },
  { id: 2, label: 'Plan' },
  { id: 3, label: 'Region' },
  { id: 4, label: 'Confirm' },
] as const

function isPricingTier(value: string | null): value is PricingTier {
  return PLANS.some((plan) => plan.id === value)
}

export function SignUpWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const planParam = searchParams.get('plan')
  const periodParam = searchParams.get('period')
  const initialPlan = isPricingTier(planParam) ? planParam : 'free'
  const initialPeriod: BillingPeriod = periodParam === 'annual' ? 'annual' : 'monthly'

  const [state, setState] = useState<SignUpState>({
    step: 1,
    name: '',
    company: '',
    email: '',
    password: '',
    billingPeriod: initialPeriod,
    selectedPlan: initialPlan,
    selectedRegion: getRegionsForTier(initialPlan)[0]?.id,
    confirmed: false,
  })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const availableRegions = useMemo(() => getRegionsForTier(state.selectedPlan ?? 'free'), [state.selectedPlan])
  const disabledRegions = useMemo(
    () => REGIONS.filter((region) => !availableRegions.some((available) => available.id === region.id)).map((region) => region.id),
    [availableRegions],
  )

  useEffect(() => {
    if (!state.selectedPlan) return

    const supported = getRegionsForTier(state.selectedPlan)
    if (!state.selectedRegion || !supported.some((region) => region.id === state.selectedRegion)) {
      setState((current) => ({ ...current, selectedRegion: supported[0]?.id }))
    }
  }, [state.selectedPlan, state.selectedRegion])

  const selectedPlan = getPlanById(state.selectedPlan ?? 'free')
  const selectedRegion = getRegionById(state.selectedRegion ?? '')

  const goToStep = (step: SignUpState['step']) => setState((current) => ({ ...current, step }))

  const handleAccountContinue = () => {
    const result = accountSchema.safeParse({
      name: state.name,
      company: state.company,
      email: state.email,
      password: state.password,
      confirmPassword,
    })

    if (!result.success) {
      const nextErrors = result.error.issues.reduce<Record<string, string>>((acc, issue) => {
        const key = String(issue.path[0])
        acc[key] = issue.message
        return acc
      }, {})
      setFieldErrors(nextErrors)
      return
    }

    setFieldErrors({})
    setState((current) => ({ ...current, authProvider: 'email', step: 2 }))
  }

  const handleSocialSignUp = (provider: 'google' | 'github') => {
    void signIn(provider, { callbackUrl: '/sign-up?step=plan' })
  }

  const handleCreateWorkspace = async () => {
    if (!state.selectedPlan || !state.selectedRegion || !selectedPlan || !selectedRegion) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      let authToken: string | undefined
      if (!state.authProvider || state.authProvider === 'email') {
        const registration = await registerUser({
          name: state.name,
          email: state.email,
          password: state.password,
          company: state.company,
        })
        authToken = registration.token
      }

      setProvisioning(true)
      const provision = await createTenant({
        plan: state.selectedPlan,
        region: state.selectedRegion,
        billingPeriod: state.billingPeriod,
      }, authToken)

      if (authToken) {
        const launch = await createSSOToken(authToken)
        window.location.assign(launch.ssoUrl ?? launch.instanceUrl ?? '/api/launch-instance')
        return
      }

      if (provision.ssoUrl || provision.instanceUrl) {
        window.location.assign('/api/launch-instance')
        return
      }
      setState((current) => ({ ...current, confirmed: true }))
      await new Promise((resolve) => setTimeout(resolve, 1800))
      router.push('/api/launch-instance')
    } catch (error) {
      setProvisioning(false)
      setSubmitError(error instanceof Error ? error.message : 'We could not start provisioning your workspace.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <section className="page-hero">
        <div className="space-y-4">
          <p className="page-hero-label">Secure onboarding</p>
          <div className="max-w-3xl space-y-3">
            <h1 className="page-hero-title">Create your ARIA workspace</h1>
            <p className="page-hero-sub">
              Set up your account, choose the right plan, and deploy your evaluation environment in the region your team trusts.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <span className="page-hero-pill">4-step setup</span>
            <span className="page-hero-pill">Provisioning in ~3 minutes</span>
            <span className="page-hero-pill">Global region selection</span>
          </div>
        </div>
      </section>

      <div className="card mt-8 space-y-8">
        <div className="grid gap-4 md:grid-cols-4">
          {steps.map((item, index) => {
            const active = state.step === item.id
            const complete = state.step > item.id

            return (
              <div key={item.id} className="relative flex items-center gap-3">
                {index > 0 ? <span className="absolute -left-3 top-5 hidden h-px w-6 bg-slate-200 md:block" /> : null}
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold',
                    complete && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    active && 'border-blue-500 bg-blue-50 text-blue-700 ring-4 ring-blue-500/10',
                    !active && !complete && 'border-slate-200 bg-white text-slate-500',
                  )}
                >
                  {complete ? <CheckCircle2 className="h-5 w-5" /> : item.id}
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Step {item.id}</p>
                  <p className="text-sm font-medium text-slate-900">{item.label}</p>
                </div>
              </div>
            )
          })}
        </div>

        {state.step === 1 ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="section-label">Step 1</p>
              <h2 className="text-2xl font-semibold text-slate-900">Create your account</h2>
              <p className="text-sm leading-6 text-slate-600">Create your account with email or use Google / GitHub to get started quickly.</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => handleSocialSignUp('google')}
                className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.2-.9 2.2-1.9 2.9l3 2.3c1.7-1.6 2.8-3.9 2.8-6.8 0-.6-.1-1.3-.2-1.8H12Z" />
                  <path fill="#34A853" d="M12 21c2.6 0 4.8-.9 6.4-2.4l-3-2.3c-.8.6-2 1-3.4 1-2.6 0-4.7-1.8-5.5-4.1l-3.1 2.4C5 18.9 8.2 21 12 21Z" />
                  <path fill="#4A90E2" d="M6.5 13.2c-.2-.6-.3-1.2-.3-1.8s.1-1.2.3-1.8l-3.1-2.4C2.5 8.7 2 10.3 2 12s.5 3.3 1.4 4.8l3.1-2.4Z" />
                  <path fill="#FBBC05" d="M12 6.7c1.5 0 2.8.5 3.8 1.5l2.8-2.8C16.8 3.8 14.6 3 12 3 8.2 3 5 5.1 3.4 8.2l3.1 2.4C7.3 8.4 9.4 6.7 12 6.7Z" />
                </svg>
                Continue with Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialSignUp('github')}
                className="flex items-center justify-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Github className="h-5 w-5" />
                Continue with GitHub
              </button>
            </div>

            <p className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              Signing up with Google or GitHub will take you straight to plan selection.
            </p>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="signup-name" className="text-sm font-medium text-slate-700">
                  Full name
                </label>
                <input
                  id="signup-name"
                  value={state.name}
                  onChange={(event) => setState((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Alex Morgan"
                />
                {fieldErrors.name ? <p className="text-sm text-rose-600">{fieldErrors.name}</p> : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-company" className="text-sm font-medium text-slate-700">
                  Company <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  id="signup-company"
                  value={state.company}
                  onChange={(event) => setState((current) => ({ ...current, company: event.target.value }))}
                  placeholder="ARIA Labs"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-email" className="text-sm font-medium text-slate-700">
                  Work email
                </label>
                <input
                  id="signup-email"
                  type="email"
                  value={state.email}
                  onChange={(event) => setState((current) => ({ ...current, email: event.target.value }))}
                  placeholder="you@company.com"
                />
                {fieldErrors.email ? <p className="text-sm text-rose-600">{fieldErrors.email}</p> : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="signup-password" className="text-sm font-medium text-slate-700">
                  Password
                </label>
                <input
                  id="signup-password"
                  type="password"
                  value={state.password}
                  onChange={(event) => setState((current) => ({ ...current, password: event.target.value }))}
                  placeholder="At least 8 characters"
                />
                {fieldErrors.password ? <p className="text-sm text-rose-600">{fieldErrors.password}</p> : null}
              </div>
              <div className="space-y-2 md:col-span-2">
                <label htmlFor="signup-confirm-password" className="text-sm font-medium text-slate-700">
                  Confirm password
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat your password"
                />
                {fieldErrors.confirmPassword ? <p className="text-sm text-rose-600">{fieldErrors.confirmPassword}</p> : null}
              </div>
            </div>

            <div className="flex justify-end">
              <button type="button" className="btn-primary rounded-xl" onClick={handleAccountContinue}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {state.step === 2 ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="section-label">Step 2</p>
              <h2 className="text-2xl font-semibold text-slate-900">Choose your plan</h2>
              <p className="text-sm leading-6 text-slate-600">Select the package that matches your evaluation volume, region needs, and observability requirements.</p>
            </div>

            <div className="inline-flex items-center rounded-full bg-slate-100 p-1 shadow-sm">
              {(['monthly', 'annual'] as BillingPeriod[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setState((current) => ({ ...current, billingPeriod: value }))}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition',
                    state.billingPeriod === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
                  )}
                >
                  {value === 'monthly' ? 'Monthly' : 'Annual'}
                </button>
              ))}
              <span className="ml-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70">Save 20%</span>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {PLANS.map((plan) => {
                const selected = state.selectedPlan === plan.id
                const price = plan.price[state.billingPeriod]

                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setState((current) => ({ ...current, selectedPlan: plan.id }))}
                    className={cn(
                      'rounded-2xl border p-5 text-left transition',
                      selected ? 'border-blue-500 bg-blue-50 ring-4 ring-blue-500/10' : 'border-slate-200 bg-white/90 hover:border-slate-300',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                      </div>
                      {selected ? <CheckCircle2 className="h-5 w-5 text-blue-600" /> : null}
                    </div>
                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-3xl font-bold tracking-tight text-slate-900">
                        {price === -1 ? 'Custom' : price === 0 ? 'Free' : `$${price}`}
                      </span>
                      {price > 0 ? <span className="pb-1 text-sm text-slate-500">/mo</span> : null}
                    </div>
                    <ul className="mt-4 space-y-2 text-sm text-slate-600">
                      {plan.features.slice(0, 4).map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <Check className="mt-0.5 h-4 w-4 text-cyan-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-between gap-3">
              <button type="button" className="btn-secondary rounded-xl" onClick={() => goToStep(1)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button type="button" className="btn-primary rounded-xl" onClick={() => goToStep(3)} disabled={!state.selectedPlan}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {state.step === 3 ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="section-label">Step 3</p>
              <h2 className="text-2xl font-semibold text-slate-900">Choose your region</h2>
              <p className="text-sm leading-6 text-slate-600">Where should we deploy your ARIA instance?</p>
              <p className="text-sm text-slate-500">Your data stays in your chosen region. You can&apos;t change this later.</p>
            </div>

            <RegionPicker
              selectedRegion={state.selectedRegion}
              onSelect={(regionId) => setState((current) => ({ ...current, selectedRegion: regionId }))}
              availableRegions={REGIONS}
              disabledRegions={disabledRegions}
            />

            <div className="flex items-center justify-between gap-3">
              <button type="button" className="btn-secondary rounded-xl" onClick={() => goToStep(2)}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button type="button" className="btn-primary rounded-xl" onClick={() => goToStep(4)} disabled={!state.selectedRegion}>
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {state.step === 4 ? (
          <div className="space-y-8">
            <div className="space-y-2">
              <p className="section-label">Step 4</p>
              <h2 className="text-2xl font-semibold text-slate-900">Review and confirm</h2>
              <p className="text-sm leading-6 text-slate-600">Confirm your plan, deployment region, and billing cadence before we provision your workspace.</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-3xl border border-slate-200 bg-white/90 p-6 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
                <h3 className="text-lg font-semibold text-slate-900">Workspace summary</h3>
                <dl className="mt-6 space-y-5 text-sm">
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <dt className="text-slate-500">Plan</dt>
                    <dd className="text-right font-medium text-slate-900">{selectedPlan?.name} · {selectedPlan ? `${selectedPlan.price[state.billingPeriod] <= 0 ? (selectedPlan.price[state.billingPeriod] === 0 ? 'Free' : 'Contact sales') : `$${selectedPlan.price[state.billingPeriod]}/mo`}` : '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <dt className="text-slate-500">Region</dt>
                    <dd className="font-medium text-slate-900">{selectedRegion ? `${selectedRegion.flag} ${selectedRegion.name}` : 'Choose a region'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
                    <dt className="text-slate-500">Billing</dt>
                    <dd className="font-medium capitalize text-slate-900">{state.billingPeriod}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-500">Account method</dt>
                    <dd className="font-medium capitalize text-slate-900">{state.authProvider ?? 'Email'}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-6">
                <p className="section-label">Provisioning</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">Your instance will be provisioned in ~3 minutes.</p>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  We&apos;ll send a confirmation to <span className="font-semibold text-slate-900">{state.email || 'your email address'}</span> as soon as the workspace is ready.
                </p>
                <ul className="mt-5 space-y-3 text-sm text-slate-600">
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-600" /> Dedicated tenant configuration</li>
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-600" /> Region-specific deployment</li>
                  <li className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-emerald-600" /> Workspace access instructions included</li>
                </ul>
              </div>
            </div>

            {provisioning ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-700">
                <div className="flex items-center gap-3 font-medium">
                  <Loader2 className="h-4 w-4 animate-spin" /> Provisioning your instance… This usually takes 3–5 minutes.
                </div>
              </div>
            ) : null}
            {submitError ? <p className="badge-fail w-full justify-center py-2 text-center">{submitError}</p> : null}

            <div className="flex items-center justify-between gap-3">
              <button type="button" className="btn-secondary rounded-xl" onClick={() => goToStep(3)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <button type="button" className="btn-primary rounded-xl" onClick={handleCreateWorkspace} disabled={submitting || provisioning}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Create my workspace
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
