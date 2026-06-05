import { Sparkles } from 'lucide-react'

interface AriaLogoProps {
  /** Tailwind size classes applied to the outer container. Default: h-8 w-8 */
  className?: string
}

/**
 * The ARIA Evaluator brand mark — a rounded-square gradient tile with a
 * Sparkles icon inside.  Matches the AppLogoIcon in the main Electron app
 * exactly so the brand identity is consistent across both surfaces.
 */
export function AriaLogo({ className = 'h-8 w-8' }: AriaLogoProps) {
  return (
    <div
      className={`grid flex-shrink-0 place-items-center rounded-[0.6rem] bg-gradient-to-br from-blue-500 via-indigo-500 to-slate-900 text-white shadow-[0_10px_30px_rgba(37,99,235,0.35)] ${className}`}
    >
      <Sparkles className="h-[60%] w-[60%]" strokeWidth={2.1} aria-hidden="true" />
    </div>
  )
}
