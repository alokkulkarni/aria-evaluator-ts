'use client'

import dynamic from 'next/dynamic'

import { cn } from '@/lib/utils'

// Loaded only on the client: WebGL can't initialise during the static export's
// build-time pre-render. The CSS fallback shows until the bundle arrives.
const NeuralField = dynamic(() => import('./NeuralField'), {
  ssr: false,
  loading: () => <HeroFallback />,
})

function HeroFallback() {
  return (
    <div className="absolute inset-0 animate-glow-pulse bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.22),transparent_60%)]" />
  )
}

export function HeroCanvas({ className }: { className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Static glow sits behind the (transparent) WebGL canvas. */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(56,189,248,0.16),transparent_62%)]" />
      <NeuralField />
    </div>
  )
}
