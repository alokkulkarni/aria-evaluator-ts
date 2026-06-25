import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'
import { GITHUB_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'ARIA Evaluator Documentation',
  description:
    'Documentation for ARIA Evaluator, the open-source AI agent evaluation tool: quick start, running locally, core concepts, and self-hosting.',
}

export default function DocsOverviewPage() {
  return (
    <>
      <DocHeading
        eyebrow="Overview"
        title="What is ARIA Evaluator"
        intro="ARIA Evaluator is an open-source tool for testing conversational AI agents. Run scenarios against any agent, score every conversation with a panel of independent LLM judges, and get a report you can trust."
      />

      <div className="docs-prose mt-8">
        <p>
          You describe what a user wants in a <strong>scenario</strong>, ARIA runs that scenario
          against your agent through an <strong>adapter</strong>, and a panel of independent LLM{' '}
          <strong>judges</strong> scores the resulting transcript across 15 quality and safety
          dimensions — with adversarial security testing built in. Everything runs on infrastructure
          you control: bring your own model provider (Amazon Bedrock / Claude), define scenarios in
          YAML, and get a shareable report with per-dimension scores and the judges&rsquo; reasoning.
        </p>

        <h2>The evaluation pipeline</h2>
        <p>Every run follows the same path:</p>
        <pre><code>Scenario (YAML) → Adapter → Conversation runner → Transcript → LLM Judge → EvalResult → Report</code></pre>
        <ul>
          <li><strong>Scenario</strong> — a YAML file with a persona, a goal, and how the conversation should run.</li>
          <li><strong>Adapter</strong> — connects ARIA to the agent under test (Connect, Lex, Azure, Copilot, OpenAPI, WebSocket…).</li>
          <li><strong>Conversation runner</strong> — drives the dialogue, scripted or AI-generated, and records an immutable transcript.</li>
          <li><strong>Judge</strong> — a panel of independent LLM judges scores the transcript across the active dimensions.</li>
          <li><strong>Report</strong> — an HTML + JSON report with scores, evidence, and reasoning; also shown live in the dashboard.</li>
        </ul>

        <h2>What it measures</h2>
        <p>
          ARIA scores conversations across <strong>15 dimensions</strong> grouped into response quality,
          task completion, safety &amp; security, customer experience, and escalation &amp; vulnerability.
          Security scenarios add adversarial coverage — prompt injection, jailbreaks, social
          engineering, and more.
        </p>

        <h2>Who it&rsquo;s for</h2>
        <p>
          Engineering, security, and product teams putting conversational AI into production —
          especially in regulated, safety-critical settings — who want a verifiable quality and
          safety score before they ship.
        </p>

        <h2>Next steps</h2>
        <ul>
          <li><Link href="/docs/quick-start">Quick Start</Link> — clone the repo and score your first scenario.</li>
          <li><Link href="/docs/run-locally">Run Locally</Link> — start the API + dashboard with <code>npm run dev</code>.</li>
          <li><Link href="/docs/architecture">Architecture</Link> — how the pieces fit together.</li>
          <li><Link href={GITHUB_URL} target="_blank" rel="noreferrer noopener">View the source on GitHub</Link>.</li>
        </ul>
      </div>
    </>
  )
}
