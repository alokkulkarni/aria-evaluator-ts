'use client'

import Link from 'next/link'
import { Check, Clock } from 'lucide-react'
import { useState } from 'react'

import { PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { BillingPeriod } from '@/types'

const isWaitlistMode = process.env.NEXT_PUBLIC_SIGNUP_MODE === 'waitlist'

export function PricingTable() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="eyebrow">Packages</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
            Choose the plan that fits your team
          </h2>
        </div>

        <div className="flex items-center gap-3">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 p-1">
            {(['monthly', 'annual'] as BillingPeriod[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition',
                  period === value
                    ? 'bg-gradient-to-r from-cyan-300 to-blue-400 text-slate-950 shadow-[0_8px_24px_-10px_rgba(34,211,238,0.7)]'
                    : 'text-slate-400 hover:text-white',
                )}
              >
                {value === 'monthly' ? 'Monthly' : 'Annual'}
              </button>
            ))}
          </div>
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-300/30">
            Save 20%
          </span>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        {PLANS.map((plan) => {
          const price = plan.price[period]
          const isPopular = Boolean(plan.popular)
          const priceLabel = price === -1 ? 'Custom' : price === 0 ? 'Free' : `$${price}`
          const suffix = price > 0 ? '/mo' : ''
          const isPaidPlan = plan.id !== 'free'
          const isLocked = isWaitlistMode && isPaidPlan

          return (
            <article
              key={plan.id}
              className={cn(
                'glass relative flex h-full flex-col justify-between gap-6 rounded-2xl p-6',
                isPopular && 'ring-conic',
                isLocked && 'opacity-75',
              )}
            >
              {isPopular ? (
                <div className="pointer-events-none absolute -top-px left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />
              ) : null}
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-display text-xl font-semibold text-white">{plan.name}</h3>
                    {isLocked ? (
                      <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-300/30">
                        Coming Soon
                      </span>
                    ) : isPopular ? (
                      <span className="rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-3 py-1 text-xs font-semibold text-slate-950">
                        Most popular
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-6 text-slate-400">{plan.tagline}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-end gap-1">
                    <span className="font-display text-4xl font-bold tracking-tight text-white">{priceLabel}</span>
                    {suffix ? <span className="pb-1 text-sm text-slate-500">{suffix}</span> : null}
                  </div>
                  <p className="text-sm text-slate-500">
                    {price <= 0
                      ? 'Start instantly with flexible onboarding.'
                      : period === 'annual'
                        ? 'Billed annually for the best rate.'
                        : 'Billed monthly with no long-term commitment.'}
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-slate-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-cyan-400" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isLocked ? (
                <span className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-400">
                  <Clock className="h-4 w-4" />
                  Coming Soon
                </span>
              ) : plan.id === 'enterprise_unlimited' ? (
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
                >
                  Contact sales
                </Link>
              ) : (
                <Link
                  href={`/sign-up?plan=${plan.id}&period=${period}`}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
                >
                  Get started
                </Link>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}
