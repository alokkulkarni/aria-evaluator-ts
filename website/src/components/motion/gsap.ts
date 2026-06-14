'use client'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

// Register once, on the client only. The static export pre-renders on the
// server where `window` is undefined and these plugins would no-op anyway.
//
// NOTE: this module lives under components/motion (not src/lib) on purpose —
// the website auth-backend Docker build copies all of src/lib into its own
// build context, where gsap is not a dependency. Keeping it here avoids
// dragging gsap/three type resolution into that build.
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, useGSAP)
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export { gsap, ScrollTrigger, useGSAP }
