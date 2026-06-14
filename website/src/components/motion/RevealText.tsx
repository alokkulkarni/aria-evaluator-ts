'use client'

import { useRef, type ElementType } from 'react'

import { gsap, prefersReducedMotion, useGSAP } from './gsap'
import { cn } from '@/lib/utils'

interface RevealTextProps {
  text: string
  className?: string
  as?: ElementType
  stagger?: number
  /** Apply the cyan gradient clip to the words. */
  gradient?: boolean
}

/**
 * Word-by-word masked rise-in for headings. Avoids the premium SplitText
 * plugin by wrapping each word in an overflow-hidden span.
 */
export function RevealText({
  text,
  className,
  as: Tag = 'h2',
  stagger = 0.055,
  gradient = false,
}: RevealTextProps) {
  const ref = useRef<HTMLElement>(null)
  const words = text.split(' ')

  useGSAP(
    () => {
      const el = ref.current
      if (!el || prefersReducedMotion()) return
      const wordEls = el.querySelectorAll('[data-word]')
      gsap.from(wordEls, {
        yPercent: 120,
        opacity: 0,
        duration: 0.85,
        ease: 'power3.out',
        stagger,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      })
    },
    { scope: ref },
  )

  return (
    <Tag ref={ref} className={cn(className)}>
      {words.map((word, i) => (
        <span
          key={i}
          className="mr-[0.26em] inline-block overflow-hidden pb-[0.12em] align-bottom"
        >
          <span
            data-word
            className={cn('inline-block will-change-transform', gradient && 'text-gradient-cyan')}
          >
            {word}
          </span>
        </span>
      ))}
    </Tag>
  )
}
