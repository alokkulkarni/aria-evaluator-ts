'use client'

import { useRef, type ElementType, type ReactNode, type Ref } from 'react'

import { gsap, prefersReducedMotion, useGSAP } from './gsap'
import { cn } from '@/lib/utils'

interface RevealProps {
  children: ReactNode
  className?: string
  /** Travel distance in px before settling. */
  y?: number
  delay?: number
  duration?: number
  /** Stagger direct children instead of revealing as one block. */
  stagger?: number
  as?: ElementType
}

/**
 * Scroll-triggered entrance. Hidden state is applied inside a layout effect
 * (before paint) so there is no flash, and content stays visible when JS is
 * disabled or reduced-motion is requested.
 */
export function Reveal({
  children,
  className,
  y = 24,
  delay = 0,
  duration = 0.9,
  stagger,
  as = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  // @react-three/fiber augments React's JSX types, which collapses the props
  // of a JSX tag typed as the full ElementType union to `never`. Type-check
  // against a single tag; `as` still picks the rendered element at runtime.
  const Tag = as as 'div'

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return

      const targets = stagger ? Array.from(el.children) : el
      if (prefersReducedMotion()) {
        gsap.set(targets, { opacity: 1, y: 0 })
        return
      }

      gsap.fromTo(
        targets,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration,
          delay,
          ease: 'power3.out',
          stagger: stagger ?? 0,
          scrollTrigger: { trigger: el, start: 'top 86%', once: true },
        },
      )
    },
    { scope: ref },
  )

  return (
    <Tag ref={ref as Ref<HTMLDivElement>} className={cn(className)}>
      {children}
    </Tag>
  )
}
