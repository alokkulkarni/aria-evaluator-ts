import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface MarqueeProps {
  children: ReactNode
  reverse?: boolean
  className?: string
  /** Gap between items, Tailwind gap token (e.g. 'gap-4'). */
  gapClassName?: string
}

/**
 * Infinite horizontal marquee. The track is duplicated so the loop is seamless;
 * CSS handles the animation (and disables it under reduced-motion).
 */
export function Marquee({ children, reverse = false, className, gapClassName = 'gap-4' }: MarqueeProps) {
  return (
    <div className={cn('marquee-mask w-full overflow-hidden', className)}>
      <div
        className={cn(
          'flex w-max',
          gapClassName,
          reverse ? 'animate-marquee-rev' : 'animate-marquee',
        )}
      >
        <div className={cn('flex shrink-0', gapClassName)}>{children}</div>
        <div className={cn('flex shrink-0', gapClassName)} aria-hidden>
          {children}
        </div>
      </div>
    </div>
  )
}
