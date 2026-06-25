import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Run Locally — ARIA Evaluator Docs',
  description: 'Run ARIA Evaluator locally with npm: prerequisites, environment, database, and the dev server.',
}

export default function RunLocallyPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="Run Locally"
        intro="Run the API and dashboard from source with npm — the best setup for active development and writing scenarios."
      />

      <div className="docs-prose mt-8">
        <h2>Prerequisites</h2>
        <ul>
          <li><strong>Node.js ≥ 20</strong> and npm.</li>
          <li>A <strong>PostgreSQL</strong> database and a <strong>Redis</strong> instance reachable from your machine. (If you&rsquo;d rather not run these yourself, use the <Link href="/docs/deploy-terraform">Docker/Terraform</Link> setup, which starts both for you.)</li>
          <li><strong>AWS credentials with Bedrock access</strong> for the judge.</li>
        </ul>

        <h2>1. Install dependencies</h2>
        <pre><code>npm install</code></pre>

        <h2>2. Configure the environment</h2>
        <p>Copy the example env file and fill in the essentials:</p>
        <pre><code>cp .env.example .env</code></pre>
        <p>At minimum, set:</p>
        <ul>
          <li><code>DATABASE_URL</code> — your Postgres connection string, e.g. <code>postgresql://aria:aria@localhost:5432/aria?schema=public</code></li>
          <li><code>REDIS_HOST</code> / <code>REDIS_PORT</code> — defaults <code>localhost</code> / <code>6379</code></li>
          <li><code>JUDGE_BEDROCK_REGION</code> and your AWS credentials (for the judge)</li>
          <li><code>ACCESS_TOKEN_SECRET</code> / <code>REFRESH_TOKEN_SECRET</code> — any strong random strings</li>
        </ul>
        <p>The full list is in <Link href="/docs/configuration">Configuration</Link>.</p>

        <h2>3. Set up the database</h2>
        <pre><code>{`npm run db:generate   # generate the Prisma client
npm run db:migrate    # apply the schema to your database`}</code></pre>

        <h2>4. Start the dev server</h2>
        <pre><code>npm run dev</code></pre>
        <p>
          This runs the API (<code>tsx watch src/api/server.ts</code>) and, once it&rsquo;s healthy, the
          Vite UI — both served at <code>http://localhost:3001</code>. Edits hot-reload. From there
          you can launch runs in the dashboard or use the <Link href="/docs/cli">CLI</Link>.
        </p>

        <h2>Other useful commands</h2>
        <table>
          <thead><tr><th>Command</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><code>npm run lint</code></td><td>Type-check the project (<code>tsc --noEmit</code>)</td></tr>
            <tr><td><code>npm run build</code></td><td>Build the API + UI for production</td></tr>
            <tr><td><code>npm run db:studio</code></td><td>Open Prisma Studio to browse the database</td></tr>
            <tr><td><code>npm run db:push</code></td><td>Push schema changes without a migration (prototyping)</td></tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
