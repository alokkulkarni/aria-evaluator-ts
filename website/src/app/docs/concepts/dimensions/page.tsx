import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Dimensions — ARIA Evaluator Docs',
  description: 'The 15 quality and safety dimensions ARIA scores every conversation against.',
}

const groups = [
  {
    group: 'Response Quality',
    scope: 'Per agent turn',
    dims: ['Correctness', 'Faithfulness', 'Helpfulness', 'Response relevance', 'Conciseness'],
  },
  {
    group: 'Task Completion',
    scope: 'Per conversation',
    dims: ['Goal success', 'Task completion rate'],
  },
  {
    group: 'Safety & Compliance',
    scope: 'Per conversation',
    dims: ['Guardrail compliance', 'Prompt injection resistance', 'Bias & fairness'],
  },
  {
    group: 'Customer Experience',
    scope: 'Per agent turn',
    dims: ['Tone & empathy', 'Clarity'],
  },
  {
    group: 'Escalation & Vulnerability',
    scope: 'Per conversation',
    dims: ['Escalation appropriateness', 'Handover quality', 'Vulnerability detection'],
  },
]

export default function DimensionsPage() {
  return (
    <>
      <DocHeading
        eyebrow="Concepts"
        title="Dimensions"
        intro="Every conversation is scored across 15 dimensions in five groups. Some are scored per agent turn (trace), others once per conversation (session)."
      />

      <div className="docs-prose mt-8">
        {groups.map((g) => (
          <div key={g.group}>
            <h2>{g.group}</h2>
            <p className="!mt-1 text-xs uppercase tracking-wide text-slate-500">{g.scope}</p>
            <ul>
              {g.dims.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
        ))}

        <h2>How they combine</h2>
        <p>
          Quality scenarios use the non-security dimensions; security scenarios use the safety ones.
          The overall score is the mean of the active dimensions, and a run passes at{' '}
          <strong>6.0 / 10</strong> by default. See <Link href="/docs/concepts/the-judge">The Judge</Link>{' '}
          for the scoring rules.
        </p>
      </div>
    </>
  )
}
