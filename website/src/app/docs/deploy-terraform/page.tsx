import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Deploy with Terraform — ARIA Evaluator Docs',
  description: 'Run ARIA Evaluator locally with one command — Terraform brings up the full docker-compose stack (app + PostgreSQL + Redis).',
}

export default function DeployTerraformPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="Deploy with Terraform"
        intro="The local environment runs the repo-root docker-compose stack for you — the app plus its PostgreSQL and Redis dependencies — in one command, health-ordered so the database is ready before the app migrates. It's the fastest way to a complete local environment."
      />

      <div className="docs-prose mt-8">
        <h2>What it brings up</h2>
        <p>
          <code>terraform apply</code> in <code>infra/terraform/environments/local</code> runs
          <code> docker compose up --build</code> against the repo-root <code>docker-compose.yml</code>:
        </p>
        <ul>
          <li>The <strong>ARIA app + dashboard</strong> at <code>http://localhost:3001</code>.</li>
          <li><strong>PostgreSQL</strong> (postgres:16-alpine) — <strong>internal to the compose network</strong>, no host port.</li>
          <li><strong>Redis</strong> (redis:7-alpine) — internal only.</li>
          <li>An optional <strong>Bedrock proxy</strong> (set <code>enable_bedrock_proxy = true</code>), letting the app call Bedrock via your local <code>~/.aws</code> credentials.</li>
        </ul>
        <p>Data persists in named Docker volumes (<code>pgdata</code>, <code>redisdata</code>, <code>appstate</code>).</p>

        <h2>Prerequisites</h2>
        <ul>
          <li><strong>Docker</strong> running (Docker Desktop or Engine) with the <code>docker compose</code> v2 plugin.</li>
          <li><strong>Terraform ≥ 1.6</strong>.</li>
          <li><strong>AWS credentials with Bedrock access</strong> — see <Link href="/docs/configuration">Configuration</Link>. They&rsquo;re mounted read-only from your host <code>~/.aws</code>.</li>
        </ul>

        <h2>Deploy</h2>
        <pre><code>{`# from the repo root — optional config (region, secrets, extra judge keys)
cp .env.example .env

cd infra/terraform/environments/local
terraform init
terraform apply`}</code></pre>
        <p>
          The app comes up at <code>http://localhost:3001</code>. Most configuration lives in the
          repo-root <code>.env</code> (compose loads it automatically); the only Terraform variables are
          <code> aws_region</code> and <code>enable_bedrock_proxy</code>.
        </p>
        <p>
          Equivalent without Terraform: <code>docker compose up --build</code> from the repo root.
        </p>

        <h2>First login</h2>
        <p>
          A default <strong>admin</strong> user is created automatically on first start, and its
          generated password is printed to the app logs. Grab it with:
        </p>
        <pre><code>docker compose logs aria-evaluator | grep -A4 &quot;default admin&quot;</code></pre>
        <p>Sign in at <code>http://localhost:3001</code>, then add teammates from the <strong>Team</strong> page.</p>

        <h2>Tear down</h2>
        <pre><code>{`terraform destroy           # stops the stack
docker compose down -v      # also wipes the postgres/redis/state volumes`}</code></pre>

        <p>
          Prefer running the app from source instead? See <Link href="/docs/run-locally">Run Locally</Link>.
        </p>
      </div>
    </>
  )
}
