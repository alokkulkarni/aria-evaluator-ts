'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'

import { gsap, prefersReducedMotion } from './gsap'
import { cn } from '@/lib/utils'

interface TiltCardProps {
  children: ReactNode
  className?: string
  /** Max rotation in degrees. */
  max?: number
  /** Show a cursor-following sheen highlight. */
  glare?: boolean
}

/** Pointer-reactive 3D tilt with an optional moving sheen. */
export function TiltCard({ children, className, max = 7, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const glareRef = useRef<HTMLDivElement>(null)

  function handleMove(e: MouseEvent) {
    const el = ref.current
    if (!el || prefersReducedMotion()) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    gsap.to(el, {
      rotateY: px * max,
      rotateX: -py * max,
      duration: 0.4,
      ease: 'power2.out',
      transformPerspective: 900,
      transformOrigin: 'center',
    })
    if (glare && glareRef.current) {
      glareRef.current.style.background = `radial-gradient(circle at ${(px + 0.5) * 100}% ${(py + 0.5) * 100}%, rgba(34,211,238,0.22), transparent 55%)`
      gsap.to(glareRef.current, { opacity: 0.5, duration: 0.3 })
    }
  }

  function handleLeave() {
    const el = ref.current
    if (!el) return
    gsap.to(el, { rotateX: 0, rotateY: 0, duration: 0.7, ease: 'power3.out' })
    if (glareRef.current) gsap.to(glareRef.current, { opacity: 0, duration: 0.4 })
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      className={cn('relative [transform-style:preserve-3d]', className)}
    >
      {children}
      {glare ? (
        <div
          ref={glareRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0"
        />
      ) : null}
    </div>
  )
}
