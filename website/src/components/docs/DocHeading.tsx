import type { ReactNode } from 'react'

/** Consistent page header for docs pages: eyebrow + title + lead intro. */
export function DocHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string
  title: string
  intro?: ReactNode
}) {
  return (
    <header className="border-b border-white/5 pb-6">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      {intro ? <p className="mt-4 text-base leading-7 text-slate-400">{intro}</p> : null}
    </header>
  )
}
