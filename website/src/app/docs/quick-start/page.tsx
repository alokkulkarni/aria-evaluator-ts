import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'
import { GITHUB_REPO } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Quick Start — ARIA Evaluator Docs',
  description: 'Clone ARIA Evaluator, run it locally with npm or Docker/Terraform, and score your first scenario.',
}

export default function QuickStartPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="Quick Start"
        intro="Get ARIA running locally and score your first conversation. No account, no sign-up — it's open source and runs on infrastructure you control."
      />

      <div className="docs-prose mt-8">
        <h2>Prerequisites</h2>
        <ul>
          <li><strong>Node.js ≥ 20</strong> and npm.</li>
          <li><strong>Amazon Bedrock access</strong> — the judge runs on Bedrock (Claude). Have AWS credentials available (e.g. <code>aws configure</code> or environment variables) with Bedrock model access in your region.</li>
          <li><strong>PostgreSQL</strong> and <strong>Redis</strong> — required at runtime. If you use the Docker/Terraform path below, both are started for you.</li>
        </ul>

        <h2>1. Clone and install</h2>
        <pre><code>{`git clone https://github.com/${GITHUB_REPO}.git
cd aria-evaluator-ts
npm install`}</code></pre>

        <p>From here, choose how you want to run ARIA — plain npm, or Docker via Terraform.</p>

        <h2>Option A — Full stack with Docker (recommended)</h2>
        <p>
          One command brings up the app plus its PostgreSQL and Redis — health-ordered, with the
          database migrated automatically. Postgres and Redis stay internal to the compose network;
          only the app is exposed.
        </p>
        <pre><code>{`# optional: copy config (AWS region, secrets, extra judge keys)
cp .env.example .env

cd infra/terraform/environments/local
terraform init
terraform apply                 # app at http://localhost:3001`}</code></pre>
        <p>
          Equivalent without Terraform: <code>docker compose up --build</code> from the repo root. Full
          details are in <Link href="/docs/deploy-terraform">Deploy with Terraform</Link>.
        </p>
        <p>
          <strong>First login:</strong> a default <code>admin</code> user is created and its password is
          printed to the logs — grab it with{' '}
          <code>docker compose logs aria-evaluator | grep -A4 &quot;default admin&quot;</code>, then invite
          teammates from the in-app <strong>Team</strong> page.
        </p>

        <h2>Option B — Run from source with npm</h2>
        <p>
          Best for active development. Provide your own host-reachable Postgres + Redis (the compose
          stack&rsquo;s are internal-only), then:
        </p>
        <pre><code>{`cp .env.example .env
# edit .env: DATABASE_URL (Postgres), REDIS_HOST/REDIS_PORT,
# JUDGE_BEDROCK_REGION, and your AWS credentials

npm run db:migrate    # create the schema
npm run dev           # API + dashboard at http://localhost:3001`}</code></pre>
        <p>
          See <Link href="/docs/run-locally">Run Locally</Link> for the full environment and{' '}
          <Link href="/docs/configuration">Configuration</Link> for every variable.
        </p>

        <h2>Run your first scenario</h2>
        <p>
          Open <code>http://localhost:3001</code>, choose a provider and a scenario, and watch the
          conversation and scores stream in live. Prefer the terminal? Point an adapter CLI at your
          agent and pass a scenario from <code>scenarios/</code>:
        </p>
        <pre><code>npm run cli:openapi -- --scenarios-dir=./scenarios --scenario=banking/functional/account_query</code></pre>
        <p>
          ARIA runs the conversation, scores the transcript with the judge panel, and writes an HTML +
          JSON report. See <Link href="/docs/cli">CLI Usage</Link> for the other providers.
        </p>

        <h2>Next steps</h2>
        <ul>
          <li><Link href="/docs/concepts/scenarios">Write your own scenarios</Link>.</li>
          <li><Link href="/docs/concepts/adapters">Connect ARIA to your agent</Link> with an adapter.</li>
          <li><Link href="/docs/concepts/dimensions">Understand the 15 dimensions</Link> the judge scores.</li>
        </ul>
      </div>
    </>
  )
}
