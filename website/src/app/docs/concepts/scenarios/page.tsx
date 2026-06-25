import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Scenarios — ARIA Evaluator Docs',
  description: 'How ARIA scenarios work: the YAML format, script vs agent mode, security scenarios, and templating.',
}

export default function ScenariosPage() {
  return (
    <>
      <DocHeading
        eyebrow="Concepts"
        title="Scenarios"
        intro="A scenario describes what you want to test: who the customer is, what they want, and how the conversation should run. Scenarios are plain YAML files."
      />

      <div className="docs-prose mt-8">
        <h2>Where they live</h2>
        <p>
          Scenarios live in <code>scenarios/</code>, organised by domain (<code>banking</code>,{' '}
          <code>finance</code>, <code>healthcare</code>, <code>insurance</code>, <code>legal</code>,{' '}
          <code>compliance</code>) and category (<code>functional</code>, <code>adversarial</code>). A
          single file can hold several scenarios separated by <code>---</code>.
        </p>

        <h2>Fields</h2>
        <table>
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>name</code></td><td>Human-readable scenario name.</td></tr>
            <tr><td><code>channel</code></td><td><code>chat</code>, <code>voice</code>, or <code>both</code>.</td></tr>
            <tr><td><code>mode</code></td><td><code>agent</code> (an LLM plays the customer) or <code>script</code> (fixed turns).</td></tr>
            <tr><td><code>authenticated</code></td><td>If <code>true</code>, the session starts pre-authenticated so the agent skips identity checks.</td></tr>
            <tr><td><code>opening_message</code></td><td>The customer&rsquo;s first message.</td></tr>
            <tr><td><code>goal</code></td><td>What the agent must achieve — used by the judge to score goal success.</td></tr>
            <tr><td><code>customer_persona</code></td><td>Instructions for the LLM customer in <code>agent</code> mode.</td></tr>
            <tr><td><code>turns</code></td><td>In <code>script</code> mode, the list of <code>{`{ send, timeout_seconds }`}</code> messages to play.</td></tr>
            <tr><td><code>attack_type</code></td><td>Present only on security scenarios — drives adversarial scoring (see below).</td></tr>
            <tr><td><code>max_turns</code>, <code>default_timeout_seconds</code>, <code>turn_delay_seconds</code></td><td>Pacing and limits for the run.</td></tr>
          </tbody>
        </table>

        <h2>Script vs agent mode</h2>
        <ul>
          <li><strong>Script mode</strong> plays the <code>turns</code> list verbatim — deterministic and good for precise adversarial probes.</li>
          <li><strong>Agent mode</strong> uses a Bedrock-backed driver to generate each customer turn from the persona, goal, and conversation so far — a more realistic, reactive test.</li>
        </ul>

        <h2>Security scenarios</h2>
        <p>
          A scenario with an <code>attack_type</code> (e.g. <code>persona_override</code>,{' '}
          <code>system_prompt_exfiltration</code>, <code>authority_impersonation</code>) is treated as
          a security test. These are scored only on the safety dimensions — see{' '}
          <Link href="/docs/concepts/the-judge">The Judge</Link>.
        </p>

        <h2>Templating</h2>
        <p>
          Placeholders like <code>{`{customer_name}`}</code>, <code>{`{customer_first_name}`}</code>,
          and <code>{`{customer_id}`}</code> are substituted at runtime from the synthetic-customer
          settings, so one scenario can run with different identities.
        </p>

        <h2>Example</h2>
        <pre><code>{`name: "Account — Balance Enquiry (Authenticated)"
channel: chat
mode: agent
authenticated: true
opening_message: "Hi, I'd like to check my current account balance please"
goal: >
  The agent greets the customer by first name ({customer_first_name}),
  provides the current account balance as a specific figure, and lists
  at least 3 recent transactions.
customer_persona: |
  You are {customer_name}, a bank customer. If asked for your date of
  birth say "12th March 1990". You are cooperative.
max_turns: 12
default_timeout_seconds: 120
turn_delay_seconds: 2.0`}</code></pre>

        <p>Run it with the <Link href="/docs/cli">CLI</Link> or from the dashboard.</p>
      </div>
    </>
  )
}
