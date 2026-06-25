import type { Metadata } from 'next'
import Link from 'next/link'

import { DocHeading } from '@/components/docs/DocHeading'

export const metadata: Metadata = {
  title: 'Deploy with Terraform — ARIA Evaluator Docs',
  description: 'Run ARIA Evaluator locally with Docker via Terraform — it brings up the app, PostgreSQL, and Redis together.',
}

export default function DeployTerraformPage() {
  return (
    <>
      <DocHeading
        eyebrow="Get Started"
        title="Deploy with Terraform"
        intro="The local Terraform stack runs ARIA as Docker containers — the app plus its PostgreSQL and Redis dependencies — with a single command. It's the fastest way to a full local environment."
      />

      <div className="docs-prose mt-8">
        <h2>What it provisions</h2>
        <p>
          The <code>local</code> environment uses the Docker Terraform provider (no AWS resources are
          created) to bring up:
        </p>
        <ul>
          <li>The <strong>ARIA app</strong> container — built from the repo-root <code>Dockerfile</code>, listening on port <code>3001</code> (host port configurable via <code>host_port</code>).</li>
          <li>A <strong>PostgreSQL</strong> container (<code>postgres:16-alpine</code>) on <code>5432</code>.</li>
          <li>A <strong>Redis</strong> container (<code>redis:7-alpine</code>) on <code>6379</code>.</li>
          <li>An optional <strong>Bedrock proxy</strong> container (set <code>bedrock_proxy_enabled = true</code>) for calling Bedrock with your local AWS credentials.</li>
        </ul>
        <p>Persistent state lives in the Docker volume <code>aria-evaluator-local-state</code>.</p>

        <h2>Prerequisites</h2>
        <ul>
          <li><strong>Docker</strong> running (Docker Desktop or Engine).</li>
          <li><strong>Terraform ≥ 1.6</strong>.</li>
          <li><strong>AWS credentials</strong> available locally (only needed so the judge can call Bedrock).</li>
        </ul>

        <h2>Deploy</h2>
        <pre><code>{`cd infra/terraform/environments/local
cp terraform.tfvars.example terraform.tfvars   # edit your values
terraform init
terraform apply`}</code></pre>
        <p>
          The app comes up at <code>http://localhost:3001</code> (see <code>terraform output app_url</code>).
          The app image is built automatically from the repo root.
        </p>

        <h2>Key variables</h2>
        <table>
          <thead><tr><th>Variable</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td><code>host_port</code></td><td>Host port for the app (default <code>3001</code>).</td></tr>
            <tr><td><code>local_scenarios_dir</code></td><td>Absolute path to your <code>scenarios/</code> folder, bind-mounted into the container.</td></tr>
            <tr><td><code>extra_environment_vars</code></td><td>Extra env for the app — judge/Bedrock settings, provider IDs, etc.</td></tr>
            <tr><td><code>bedrock_proxy_enabled</code> / <code>bedrock_model_id</code> / <code>bedrock_region</code></td><td>Enable and configure the optional Bedrock proxy container.</td></tr>
          </tbody>
        </table>

        <h2>Tear down</h2>
        <pre><code>terraform destroy</code></pre>
        <blockquote>
          <code>terraform destroy</code> removes the state volume. Back up anything under the local
          <code> data/</code> directory first if you want to keep it.
        </blockquote>

        <p>
          For the npm-based workflow instead, see <Link href="/docs/run-locally">Run Locally</Link>.
        </p>
      </div>
    </>
  )
}
