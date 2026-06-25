import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Configuration — ARIA Evaluator Docs',
  description: 'Environment variables for ARIA Evaluator: core settings, the judge, agent providers, and where scenarios live.',
}

export default function ConfigurationPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="Configuration"
        intro="ARIA is configured through environment variables (a .env file locally). Here are the ones you'll actually touch."
      />

      <div className="docs-prose mt-8">
        <h2>Core</h2>
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>PORT</code></td><td><code>3001</code></td><td>HTTP listen port (API + dashboard).</td></tr>
            <tr><td><code>DATABASE_URL</code></td><td>—</td><td>Postgres connection string, e.g. <code>postgresql://aria:aria@localhost:5432/aria?schema=public</code>.</td></tr>
            <tr><td><code>REDIS_HOST</code> / <code>REDIS_PORT</code></td><td><code>localhost</code> / <code>6379</code></td><td>Redis for sessions and the background job queue.</td></tr>
            <tr><td><code>ACCESS_TOKEN_SECRET</code> / <code>REFRESH_TOKEN_SECRET</code></td><td>—</td><td>Secrets for the local API&rsquo;s tokens — set any strong random strings.</td></tr>
          </tbody>
        </table>

        <h2>AWS credentials</h2>
        <p>
          ARIA&rsquo;s judge runs on <strong>Amazon Bedrock</strong>, so you need AWS credentials with
          access to a Bedrock model. The local stack mounts your host <code>~/.aws</code> directory
          <strong>read-only</strong> into the containers, so once your CLI is configured no extra wiring
          is needed.
        </p>
        <ul>
          <li><strong>Configure credentials</strong> — run <code>aws configure</code> (writes <code>~/.aws/credentials</code>), or <code>aws sso login</code> for an SSO profile. Environment variables (<code>AWS_ACCESS_KEY_ID</code> / <code>AWS_SECRET_ACCESS_KEY</code>) also work.</li>
          <li><strong>Pick a region</strong> — set <code>AWS_REGION</code> / <code>JUDGE_BEDROCK_REGION</code> to a region where you have Bedrock access (default <code>eu-west-2</code>).</li>
          <li><strong>Enable model access</strong> — in the AWS console, open <em>Bedrock → Model access</em> and enable the Claude models you&rsquo;ll judge with. Without this, judge calls fail with an access error.</li>
        </ul>
        <p>
          The app starts fine without AWS credentials — you only need them to actually run an
          evaluation (the judge call).
        </p>

        <h2>The judge</h2>
        <p>The judge runs on Amazon Bedrock by default. Newer models are resolved to the correct cross-region inference profile automatically based on the region.</p>
        <table>
          <thead><tr><th>Variable</th><th>Default</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>JUDGE_BEDROCK_REGION</code></td><td><code>eu-west-2</code></td><td>Region for judge Bedrock calls; overrides <code>BEDROCK_REGION</code>.</td></tr>
            <tr><td><code>BEDROCK_REGION</code></td><td><code>us-east-1</code></td><td>Fallback Bedrock region.</td></tr>
            <tr><td><code>JUDGE_MODEL_ID</code></td><td>—</td><td>Override the judge model, e.g. <code>eu.anthropic.claude-sonnet-4-5-20250929-v1:0</code>.</td></tr>
            <tr><td><code>JUDGE_MAX_TOKENS</code></td><td><code>1200</code></td><td>Max tokens per judge call.</td></tr>
            <tr><td><code>JUDGE_TEMPERATURE</code></td><td><code>0</code></td><td>Judge temperature (0 = deterministic).</td></tr>
            <tr><td><code>JUDGE_SYSTEM_PROMPT</code></td><td>built-in</td><td>Override the full judge system prompt.</td></tr>
          </tbody>
        </table>
        <p>
          ARIA can also run a <strong>committee of judges</strong> across providers. Supply the keys
          for the ones you want — <code>OPENAI_API_KEY</code>, <code>ANTHROPIC_API_KEY</code>,{' '}
          <code>GEMINI_API_KEY</code>, or the <code>AZURE_OPENAI_*</code> variables — and configure the
          committee in Settings.
        </p>

        <h2>Agent providers</h2>
        <p>Each adapter reads its own connection variables. The most common:</p>
        <table>
          <thead><tr><th>Provider</th><th>Variables</th></tr></thead>
          <tbody>
            <tr><td>Amazon Connect</td><td><code>CONNECT_INSTANCE_ID</code>, <code>CONNECT_REGION</code>, <code>CONNECT_CONTACT_FLOW_NAME</code></td></tr>
            <tr><td>AWS Lex</td><td><code>LEX_BOT_ID</code>, <code>LEX_BOT_ALIAS_ID</code>, <code>LEX_REGION</code></td></tr>
            <tr><td>OpenAPI / custom HTTP</td><td>Endpoint configured per run (CLI flags or the dashboard).</td></tr>
          </tbody>
        </table>

        <h2>Scenarios &amp; reports</h2>
        <p>
          Scenarios are read from the <code>scenarios/</code> directory by default. In containers they
          are bind-mounted at <code>/app/state/scenarios</code> and reports are written to{' '}
          <code>/app/state/reports</code>. See <Link href="/docs/concepts/scenarios">Scenarios</Link> for
          the file format.
        </p>
      </div>
    </>
  )
}
