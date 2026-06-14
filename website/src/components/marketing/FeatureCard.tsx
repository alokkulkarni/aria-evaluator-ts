import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { TiltCard } from '@/components/motion/TiltCard'

/**
 * Server component so callers can pass a lucide icon component directly
 * (component references can't cross the server→client boundary). The
 * interactive tilt lives in the nested client `TiltCard`.
 */
export function FeatureCard({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  className?: string
}) {
  return (
    <TiltCard className={cn('h-full rounded-2xl', className)}>
      <article className="glass group relative h-full overflow-hidden rounded-2xl p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-cyan-400/10 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
        <div className="relative space-y-4">
          <div className="inline-flex rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-300/15 to-blue-400/5 p-3 text-cyan-300 ring-1 ring-white/5">
            <Icon className="h-5 w-5" />
          </div>
          <h3 className="font-display text-lg font-semibold text-white">{title}</h3>
          <p className="text-sm leading-6 text-slate-400">{description}</p>
        </div>
      </article>
    </TiltCard>
  )
}
