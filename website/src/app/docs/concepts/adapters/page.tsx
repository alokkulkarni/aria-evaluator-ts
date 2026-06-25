import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'
import { GITHUB_CONTRIBUTING_URL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Adapters — ARIA Evaluator Docs',
  description: 'How adapters connect ARIA to the agent under test, the built-in providers, and how to add your own.',
}

export default function AdaptersPage() {
  return (
    <>
      <DocHeading
        eyebrow="Concepts"
        title="Adapters"
        intro="An adapter is the bridge between ARIA and the agent you're testing. It speaks the agent's protocol so the conversation runner doesn't have to."
      />

      <div className="docs-prose mt-8">
        <h2>The contract</h2>
        <p>Every adapter implements a small <code>BaseAdapter</code> lifecycle:</p>
        <pre><code>{`connect()      → open a session with the agent
sendMessage()  → send the customer's message
receive()      → get the agent's reply (null on timeout)
disconnect()   → close the session`}</code></pre>
        <p>
          <code>receive()</code> returns an <code>AdapterMessage</code> (<code>role</code>,{' '}
          <code>content</code>, and metadata), returns <code>null</code> on timeout, and throws a{' '}
          <code>SessionEndedError</code> when the agent closes the session. That&rsquo;s the whole
          surface — everything else (scoring, transcripts, reports) is handled for you.
        </p>

        <h2>Built-in adapters</h2>
        <table>
          <thead><tr><th>Provider</th><th>Channel</th></tr></thead>
          <tbody>
            <tr><td>Amazon Connect (chat &amp; voice / WebRTC)</td><td>chat, voice</td></tr>
            <tr><td>AWS Lex V2</td><td>chat</td></tr>
            <tr><td>Azure Direct Line / GitHub Copilot Chat</td><td>chat</td></tr>
            <tr><td>Azure OpenAI Agents Runtime</td><td>chat</td></tr>
            <tr><td>Strands / AgentCore</td><td>chat</td></tr>
            <tr><td>OpenAPI 3.x HTTP endpoint</td><td>chat</td></tr>
            <tr><td>Generic HTTP / WebSocket</td><td>chat, voice</td></tr>
          </tbody>
        </table>

        <h2>Adding a new adapter</h2>
        <ol>
          <li>Create <code>src/adapters/my-platform.ts</code> implementing <code>BaseAdapter</code> (connect → sendMessage → receive → disconnect).</li>
          <li>Return an <code>AdapterMessage</code> from <code>receive()</code>; throw <code>SessionEndedError</code> on close and return <code>null</code> on timeout.</li>
          <li>Register the provider in <code>src/conversation/runner.ts</code> (<code>normalizeProvider()</code>).</li>
          <li>Add a CLI wrapper at <code>src/cli/run-my-platform.ts</code> so it gets an <code>npm run cli:*</code> entry.</li>
        </ol>
        <p>
          Contributions are welcome — see the{' '}
          <Link href={GITHUB_CONTRIBUTING_URL} target="_blank" rel="noreferrer noopener">contributing guide</Link>.
        </p>
      </div>
    </>
  )
}
