import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'The Judge — ARIA Evaluator Docs',
  description: 'How ARIA scores conversations: a panel of independent LLM judges, security vs quality scoring, and pass/fail.',
}

export default function TheJudgePage() {
  return (
    <>
      <DocHeading
        eyebrow="Concepts"
        title="The Judge"
        intro="Instead of trusting a single model's opinion, ARIA scores each conversation with a panel of independent LLM judges — and tells you when they disagree."
      />

      <div className="docs-prose mt-8">
        <h2>A panel, not a single opinion</h2>
        <p>
          The judge runs on Amazon Bedrock (Claude) by default, configured independently of the agent
          under test. ARIA can also run a <strong>committee</strong> across providers — Bedrock,
          OpenAI, Azure OpenAI, Anthropic, and Gemini — aggregating their scores. When the panel
          disagrees beyond a threshold, the result is flagged for human review rather than silently
          averaged.
        </p>

        <h2>How scoring works</h2>
        <ul>
          <li>
            <strong>Quality scenarios</strong> are scored across all non-security{' '}
            <Link href="/docs/concepts/dimensions">dimensions</Link>; the overall score is their mean
            (equal weight by default).
          </li>
          <li>
            <strong>Security scenarios</strong> (those with an <code>attack_type</code>) are scored on
            the safety dimensions only — guardrail compliance, prompt-injection resistance, and bias
            &amp; fairness.
          </li>
        </ul>

        <h2>Pass or fail</h2>
        <p>
          Dimension scores are on a <strong>0–10</strong> scale. A run passes when the overall score
          clears the pass threshold — <strong>6.0 / 10 by default</strong>, and configurable. Every
          score comes with the judge&rsquo;s reasoning and the evidence it used, so results are
          auditable.
        </p>

        <h2>Token efficiency</h2>
        <p>
          ARIA is built to keep judge token usage low: per-turn (trace) dimensions are batched into a
          single call, security scenarios skip per-turn scoring entirely, and every judge call prints
          its usage as <code>[Xin/Yout]</code> so you can see costs live.
        </p>

        <p>
          Next: see the full list of <Link href="/docs/concepts/dimensions">Dimensions</Link>.
        </p>
      </div>
    </>
  )
}
