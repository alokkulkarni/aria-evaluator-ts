import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'CLI Usage — ARIA Evaluator Docs',
  description: 'Run scenarios from the terminal with the ARIA CLI: one command per adapter, plus the common flags.',
}

export default function CliPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="CLI Usage"
        intro="Every adapter has a CLI entry point. Pass a scenario and ARIA runs the conversation, scores it, and writes a report — no dashboard required."
      />

      <div className="docs-prose mt-8">
        <h2>Commands</h2>
        <p>Each command targets a different agent platform:</p>
        <table>
          <thead><tr><th>Command</th><th>Targets</th></tr></thead>
          <tbody>
            <tr><td><code>npm run cli:connect</code></td><td>Amazon Connect (chat / voice)</td></tr>
            <tr><td><code>npm run cli:lex</code></td><td>AWS Lex V2</td></tr>
            <tr><td><code>npm run cli:azure</code></td><td>Azure Direct Line</td></tr>
            <tr><td><code>npm run cli:azure-openai</code></td><td>Azure OpenAI Agents Runtime</td></tr>
            <tr><td><code>npm run cli:strands</code></td><td>Strands / AgentCore HTTP</td></tr>
            <tr><td><code>npm run cli:copilot</code></td><td>GitHub Copilot Chat</td></tr>
            <tr><td><code>npm run cli:openapi</code></td><td>Any OpenAPI 3.x HTTP endpoint</td></tr>
            <tr><td><code>npm run cli:custom</code></td><td>Generic HTTP / WebSocket endpoint</td></tr>
          </tbody>
        </table>

        <h2>Running a scenario</h2>
        <p>Pass arguments after <code>--</code> so npm forwards them to the CLI:</p>
        <pre><code>npm run cli:openapi -- --scenarios-dir=./scenarios --scenario=banking/functional/account_query</code></pre>
        <p>
          Each judge call prints its token usage as <code>[Xin/Yout]</code> in the terminal, and the
          run writes a paired HTML + JSON report when it finishes.
        </p>

        <h2>Common flags</h2>
        <table>
          <thead><tr><th>Flag</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>--scenario</code>, <code>-s</code></td><td>Path-prefix filter for scenarios to run (relative to the scenarios dir), e.g. <code>banking/functional/account_query</code>.</td></tr>
            <tr><td><code>--scenarios-dir</code></td><td>Directory to load scenarios from. Use <code>./scenarios</code> for the repo&rsquo;s bundled packs.</td></tr>
            <tr><td><code>--channel</code>, <code>-c</code></td><td><code>chat</code> (default) or <code>voice</code>.</td></tr>
            <tr><td><code>--transcript</code>, <code>-t</code></td><td>Re-evaluate a saved transcript JSON without re-running the conversation.</td></tr>
            <tr><td><code>--conversation-only</code> / <code>--no-eval</code></td><td>Run the conversation without invoking the judge.</td></tr>
          </tbody>
        </table>

        <p>
          New to scenarios? See <Link href="/docs/concepts/scenarios">Scenarios</Link> for the YAML
          format.
        </p>
      </div>
    </>
  )
}
