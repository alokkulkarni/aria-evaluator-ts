'use client'

import { useState } from 'react'

import { DimensionOrbitCanvas } from '@/components/three/DimensionOrbitCanvas'

const dimensionGroups = [
  {
    category: 'Response Quality',
    color: '#22d3ee',
    tone: 'bg-cyan-400',
    glow: 'shadow-[0_0_12px_rgba(34,211,238,0.8)]',
    dimensions: ['Correctness', 'Faithfulness', 'Helpfulness', 'Relevance', 'Conciseness'],
  },
  {
    category: 'Task Completion',
    color: '#3b82f6',
    tone: 'bg-blue-400',
    glow: 'shadow-[0_0_12px_rgba(59,130,246,0.8)]',
    dimensions: ['Goal Success', 'Task Completion Rate'],
  },
  {
    category: 'Safety & Security',
    color: '#f43f5e',
    tone: 'bg-rose-400',
    glow: 'shadow-[0_0_12px_rgba(244,63,94,0.8)]',
    dimensions: ['Guardrail Compliance', 'Prompt Injection Resistance', 'Bias & Fairness'],
  },
  {
    category: 'Customer Experience',
    color: '#34d399',
    tone: 'bg-emerald-400',
    glow: 'shadow-[0_0_12px_rgba(52,211,153,0.8)]',
    dimensions: ['Tone & Empathy', 'Clarity'],
  },
  {
    category: 'Escalation & Vulnerability',
    color: '#fbbf24',
    tone: 'bg-amber-400',
    glow: 'shadow-[0_0_12px_rgba(251,191,36,0.8)]',
    dimensions: ['Escalation Appropriateness', 'Handover Quality', 'Vulnerability Detection'],
  },
]

const orbitNodes = dimensionGroups.map((group) => ({ label: group.category, color: group.color }))

/**
 * The "15 dimensions" showcase: an interactive 3D orbit of the judge panel
 * (five category nodes around a central judge core) hover-synced with the
 * category cards beside it.
 */
export function DimensionsShowcase() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const active = activeIndex === null ? null : dimensionGroups[activeIndex]

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="relative hidden aspect-square max-h-[520px] w-full lg:block">
        <DimensionOrbitCanvas
          className="absolute inset-0"
          nodes={orbitNodes}
          activeIndex={activeIndex}
          onActiveChange={setActiveIndex}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span data-testid="orbit-caption" className="glass rounded-full px-4 py-1.5 text-xs text-slate-300">
            {active ? (
              <>
                <span className="font-semibold text-white">{active.category}</span>
                {` · ${active.dimensions.length} ${active.dimensions.length === 1 ? 'dimension' : 'dimensions'}`}
              </>
            ) : (
              '15 dimensions · 5 categories'
            )}
          </span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {dimensionGroups.map((group, i) => (
          <article
            key={group.category}
            data-active={activeIndex === i || undefined}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(null)}
            className="glass group rounded-2xl p-5 transition-colors hover:border-cyan-300/30 data-[active]:border-cyan-300/40 data-[active]:bg-white/[0.07] sm:last:col-span-2 lg:last:col-span-1"
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${group.tone} ${group.glow}`} />
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                {group.dimensions.length} {group.dimensions.length === 1 ? 'dimension' : 'dimensions'}
              </span>
            </div>
            <h3 className="mt-4 font-display text-sm font-semibold text-white">{group.category}</h3>
            <ul className="mt-3 space-y-2">
              {group.dimensions.map((dimension) => (
                <li key={dimension} className="flex items-center gap-2 text-xs leading-5 text-slate-400">
                  <span className="h-1 w-1 rounded-full bg-slate-600" />
                  {dimension}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  )
}
