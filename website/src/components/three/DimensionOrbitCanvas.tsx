'use client'

import dynamic from 'next/dynamic'

import { cn } from '@/lib/utils'
import type { DimensionOrbitProps } from './DimensionOrbit'

// Loaded only on the client: WebGL can't initialise during the static export's
// build-time pre-render. The CSS fallback shows until the bundle arrives.
const DimensionOrbit = dynamic(() => import('./DimensionOrbit'), {
  ssr: false,
  loading: () => null,
})

export interface DimensionOrbitCanvasProps extends DimensionOrbitProps {
  className?: string
}

export function DimensionOrbitCanvas({ className, ...props }: DimensionOrbitCanvasProps) {
  return (
    <div className={cn('relative', className)} aria-hidden>
      {/* Static glow sits behind the (transparent) WebGL canvas and doubles
          as the fallback when WebGL is unavailable or still loading. */}
      <div className="pointer-events-none absolute inset-0 animate-glow-pulse bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.16),transparent_58%)]" />
      <DimensionOrbit {...props} />
    </div>
  )
}
