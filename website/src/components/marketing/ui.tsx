'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import { CountUp } from '@/components/motion/CountUp'
import { MagneticButton } from '@/components/motion/MagneticButton'
import { Reveal } from '@/components/motion/Reveal'
import { RevealText } from '@/components/motion/RevealText'

interface Cta {
  href: string
  label: string
}

/** Standard padded content section. */
export function Section({
  id,
  className,
  children,
}: {
  id?: string
  className?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={cn('max-w-8xl mx-auto px-4 py-20 sm:px-6 lg:px-8', className)}>
      {children}
    </section>
  )
}

/** Eyebrow + animated heading + optional subtitle. */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = 'left',
  gradient = false,
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  align?: 'left' | 'center'
  gradient?: boolean
}) {
  return (
    <div className={cn('space-y-4', align === 'center' && 'mx-auto max-w-3xl text-center')}>
      {eyebrow ? (
        <Reveal>
          <p className={cn('eyebrow', align === 'center' && 'justify-center')}>{eyebrow}</p>
        </Reveal>
      ) : null}
      <RevealText
        as="h2"
        gradient={gradient}
        text={title}
        className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl"
      />
      {subtitle ? (
        <Reveal delay={0.08}>
          <p className={cn('text-base leading-7 text-slate-400', align === 'center' && 'mx-auto max-w-2xl')}>
            {subtitle}
          </p>
        </Reveal>
      ) : null}
    </div>
  )
}

/** Inner-page hero header. */
export function PageHeader({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  pills,
}: {
  eyebrow: string
  title: string
  description?: string
  primary?: Cta
  secondary?: Cta
  pills?: string[]
}) {
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_28%_-10%,rgba(34,211,238,0.16),transparent_60%)]" />
      <Section className="relative pb-12 pt-16 sm:pt-24">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
        </Reveal>
        <RevealText
          as="h1"
          text={title}
          className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[1.06] tracking-tight text-white sm:text-6xl"
        />
        {description ? (
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">{description}</p>
          </Reveal>
        ) : null}
        {primary || secondary ? (
          <Reveal delay={0.18}>
            <div className="mt-8 flex flex-wrap gap-3">
              {primary ? (
                <MagneticButton
                  href={primary.href}
                  className="items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_40px_-12px_rgba(34,211,238,0.7)] transition hover:brightness-110"
                >
                  {primary.label}
                </MagneticButton>
              ) : null}
              {secondary ? (
                <Link
                  href={secondary.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
                >
                  {secondary.label} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </Reveal>
        ) : null}
        {pills?.length ? (
          <Reveal delay={0.26}>
            <div className="mt-8 flex flex-wrap gap-2.5">
              {pills.map((p) => (
                <span
                  key={p}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300"
                >
                  {p}
                </span>
              ))}
            </div>
          </Reveal>
        ) : null}
      </Section>
    </section>
  )
}

/** Reusable closing call-to-action band. */
export function CtaBand({
  eyebrow = 'Ready to launch',
  title,
  description,
  primary = { href: '/sign-up', label: 'Start for free' },
  secondary,
}: {
  eyebrow?: string
  title: string
  description?: string
  primary?: Cta
  secondary?: Cta
}) {
  return (
    <Section>
      <Reveal>
        <div className="ring-conic glass-strong relative overflow-hidden px-6 py-12 sm:px-12">
          <div className="pointer-events-none absolute -left-16 -top-20 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <p className="eyebrow">{eyebrow}</p>
              <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {title}
              </h2>
              {description ? <p className="text-sm leading-6 text-slate-400">{description}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <MagneticButton
                href={primary.href}
                className="items-center justify-center rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-6 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_40px_-12px_rgba(34,211,238,0.7)] transition hover:brightness-110"
              >
                {primary.label}
              </MagneticButton>
              {secondary ? (
                <Link
                  href={secondary.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
                >
                  {secondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  )
}

/** Animated metric tile. */
export function StatCard({
  value,
  label,
  prefix,
  suffix,
  decimals,
  separator,
}: {
  value: number
  label: string
  prefix?: string
  suffix?: string
  decimals?: number
  separator?: boolean
}) {
  return (
    <div className="glass relative overflow-hidden rounded-2xl p-6">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <CountUp
        value={value}
        prefix={prefix}
        suffix={suffix}
        decimals={decimals}
        separator={separator}
        className="font-display text-4xl font-bold tracking-tight text-white"
      />
      <p className="mt-1.5 text-sm text-slate-400">{label}</p>
    </div>
  )
}
