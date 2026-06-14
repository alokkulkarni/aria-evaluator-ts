'use client'

import Link from 'next/link'
import { useRef, type MouseEvent, type ReactNode } from 'react'

import { gsap, prefersReducedMotion } from './gsap'
import { cn } from '@/lib/utils'

interface MagneticButtonProps {
  href: string
  children: ReactNode
  className?: string
  /** 0–1, how far the button follows the cursor. */
  strength?: number
  external?: boolean
}

/**
 * A CTA that is gently pulled toward the cursor and springs back on leave.
 * Degrades to a plain link when reduced-motion is requested.
 */
export function MagneticButton({
  href,
  children,
  className,
  strength = 0.4,
  external = false,
}: MagneticButtonProps) {
  const ref = useRef<HTMLAnchorElement>(null)

  function handleMove(e: MouseEvent) {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - (rect.left + rect.width / 2)
    const y = e.clientY - (rect.top + rect.height / 2)
    gsap.to(el, { x: x * strength, y: y * strength, duration: 0.4, ease: 'power3.out' })
  }

  function handleLeave() {
    const el = ref.current
    if (!el) return
    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.4)' })
  }

  const classes = cn('inline-flex will-change-transform', className)

  if (external) {
    return (
      <a
        ref={ref}
        href={href}
        target="_blank"
        rel="noreferrer"
        className={classes}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {children}
      </a>
    )
  }

  return (
    <Link
      ref={ref}
      href={href}
      className={classes}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      {children}
    </Link>
  )
}
