'use client'

import Link from 'next/link'
import { Check, Clock } from 'lucide-react'
import { useState } from 'react'

import { formatPlanPrice, PLANS } from '@/lib/plans'
import { cn } from '@/lib/utils'
import type { BillingPeriod } from '@/types'

const isWaitlistMode = process.env.NEXT_PUBLIC_SIGNUP_MODE === 'waitlist'

export function PricingTable() {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="section-label">Packages</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Choose the plan that fits your team</h2>
        </div>

        <div className="inline-flex items-center rounded-full bg-slate-100 p-1 shadow-sm">
          {(['monthly', 'annual'] as BillingPeriod[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPeriod(value)}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition',
                period === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900',
              )}
            >
              {value === 'monthly' ? 'Monthly' : 'Annual'}
            </button>
          ))}
          <span className="ml-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200/70">
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
                'card flex h-full flex-col justify-between gap-6',
                isPopular && 'ring-2 ring-[var(--brand)] shadow-[0_24px_60px_rgba(11,31,77,0.15)]',
                isLocked && 'opacity-75',
              )}
            >
              <div className="space-y-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xl font-semibold text-slate-900">{plan.name}</h3>
                    {isLocked ? (
                      <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200/70">
                        Coming Soon
                      </span>
                    ) : isPopular ? (
                      <span className="rounded-full bg-cyan-400 px-3 py-1 text-xs font-semibold text-slate-950">Most popular</span>
                    ) : null}
                  </div>
                  <p className="text-sm leading-6 text-slate-600">{plan.tagline}</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-end gap-1">
                    <span className="text-4xl font-bold tracking-tight text-slate-900">{priceLabel}</span>
                    {suffix ? <span className="pb-1 text-sm text-slate-500">{suffix}</span> : null}
                  </div>
                  <p className="text-sm text-slate-500">
                    {price <= 0 ? 'Start instantly with flexible onboarding.' : period === 'annual' ? 'Billed annually for the best rate.' : 'Billed monthly with no long-term commitment.'}
                  </p>
                </div>

                <ul className="space-y-3 text-sm text-slate-600">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 flex-none text-cyan-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isLocked ? (
                <span className="btn-secondary justify-center rounded-xl cursor-not-allowed flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Coming Soon
                </span>
              ) : plan.id === 'enterprise_unlimited' ? (
                <Link href="/contact" className="btn-secondary justify-center rounded-xl">
                  Contact sales
                </Link>
              ) : (
                <Link href={`/sign-up?plan=${plan.id}&period=${period}`} className="btn-primary justify-center rounded-xl">
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
