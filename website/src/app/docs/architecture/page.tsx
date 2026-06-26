import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'
import { ArchitectureDiagram } from '@/components/docs/ArchitectureDiagram'

export const metadata: Metadata = {
  title: 'Architecture — ARIA Evaluator Docs',
  description: 'How ARIA Evaluator is structured: the evaluation pipeline, the stack, the source layout, and the database.',
}

export default function ArchitecturePage() {
  return (
    <>
      <DocHeading
        eyebrow="Overview"
        title="Architecture"
        intro="ARIA is a single TypeScript application: an API and dashboard, an evaluation engine, pluggable adapters, and an LLM judge. Here's how the pieces fit together."
      />

      <div className="mt-8">
        <ArchitectureDiagram />
      </div>

      <div className="docs-prose mt-10">
        <h2>System architecture</h2>
        <p>
          The diagram below shows how ARIA's internal components — the API server, evaluation engine,
          adapter plane, and judge — are wired together.
        </p>
      </div>

      <figure className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:p-6">
        <Image
          src="/docs/aria-architecture.drawio.png"
          alt="ARIA Evaluator system architecture diagram"
          width={1600}
          height={900}
          className="w-full rounded-lg"
          priority
        />
        <figcaption className="mt-3 text-center text-xs text-slate-500">
          ARIA Evaluator — component architecture
        </figcaption>
      </figure>

      <div className="docs-prose mt-10">
        <h2>End-to-end flow</h2>
        <p>
          The diagram below traces a full evaluation from scenario input through the adapter and
          conversation runner to the judge and final report.
        </p>
      </div>

      <figure className="not-prose my-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:p-6">
        <Image
          src="/docs/aria-e2e-architecture.drawio.png"
          alt="ARIA Evaluator end-to-end evaluation flow diagram"
          width={1600}
          height={900}
          className="w-full rounded-lg"
        />
        <figcaption className="mt-3 text-center text-xs text-slate-500">
          ARIA Evaluator — end-to-end evaluation flow
        </figcaption>
      </figure>

      <div className="docs-prose mt-10">
        <h2>The evaluation pipeline</h2>
        <p>A run is a straight line from a scenario to a report:</p>
        <pre><code>Scenario (YAML) → Adapter → Conversation runner → Transcript → LLM Judge → EvalResult → Reports / Dashboard</code></pre>
        <ul>
          <li><strong>Adapter</strong> connects to the agent under test and exchanges messages.</li>
          <li><strong>Conversation runner</strong> drives the dialogue — scripted turns or an AI-generated customer — and saves an immutable transcript.</li>
          <li><strong>Judge</strong> scores the transcript with a panel of independent LLM judges.</li>
          <li><strong>EvalResult</strong> is rendered into an HTML + JSON report and streamed live to the dashboard.</li>
        </ul>

        <h2>Stack</h2>
        <p>
          TypeScript · Express · React (Vite + Tailwind) · Prisma · PostgreSQL · Redis (sessions +
          job queue) · Amazon Bedrock (the judge). It runs as one process locally and as a container
          image when self-hosted.
        </p>

        <h2>Source layout</h2>
        <table>
          <thead>
            <tr><th>Path</th><th>What lives there</th></tr>
          </thead>
          <tbody>
            <tr><td><code>src/adapters/</code></td><td>Provider adapters (Connect, Lex, Azure, Copilot, OpenAPI, WebSocket, custom).</td></tr>
            <tr><td><code>src/conversation/</code></td><td>The conversation runner and transcript model; script vs agent mode.</td></tr>
            <tr><td><code>src/judge/</code></td><td>The LLM judge — dimensions, scoring, and Bedrock providers.</td></tr>
            <tr><td><code>src/api/</code></td><td>Express routes, run queue, and live progress streaming.</td></tr>
            <tr><td><code>src/cli/</code></td><td>Per-provider CLI entry points (<code>run-openapi.ts</code>, <code>run-connect.ts</code>, …).</td></tr>
            <tr><td><code>src/ui/</code></td><td>The React dashboard.</td></tr>
            <tr><td><code>scenarios/</code></td><td>Scenario YAML files, organised by domain and category.</td></tr>
            <tr><td><code>prisma/</code></td><td>Database schema and migrations.</td></tr>
            <tr><td><code>infra/terraform/</code></td><td>Terraform for local (Docker) and self-hosted deployments.</td></tr>
          </tbody>
        </table>

        <h2>Database</h2>
        <p>
          ARIA uses Prisma with <strong>PostgreSQL</strong>. The local Terraform setup runs a Postgres
          container for you; for an npm-only workflow, point <code>DATABASE_URL</code> at any Postgres
          instance. Apply the schema with <code>npm run db:migrate</code>. Redis backs sessions and the
          background job queue.
        </p>

        <p>
          Ready to run it? Head to the <Link href="/docs/quick-start">Quick Start</Link>.
        </p>
      </div>
    </>
  )
}
