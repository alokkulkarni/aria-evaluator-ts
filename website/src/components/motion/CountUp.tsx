'use client'

import { useRef } from 'react'

import { gsap, prefersReducedMotion, useGSAP } from './gsap'
import { cn } from '@/lib/utils'

interface CountUpProps {
  value: number
  prefix?: string
  suffix?: string
  decimals?: number
  duration?: number
  /** Insert thousands separators (e.g. 1,240). */
  separator?: boolean
  className?: string
}

function format(value: number, decimals: number, separator: boolean): string {
  const fixed = value.toFixed(decimals)
  if (!separator) return fixed
  const [int, dec] = fixed.split('.')
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? `${withSep}.${dec}` : withSep
}

/** Counts from 0 to `value` once it scrolls into view. */
export function CountUp({
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  duration = 2,
  separator = false,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      const render = (v: number) => {
        el.textContent = `${prefix}${format(v, decimals, separator)}${suffix}`
      }
      if (prefersReducedMotion()) {
        render(value)
        return
      }
      const counter = { v: 0 }
      gsap.to(counter, {
        v: value,
        duration,
        ease: 'power2.out',
        onUpdate: () => render(counter.v),
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      })
    },
    { scope: ref, dependencies: [value] },
  )

  return (
    <span ref={ref} className={cn(className)}>
      {`${prefix}${format(0, decimals, separator)}${suffix}`}
    </span>
  )
}
