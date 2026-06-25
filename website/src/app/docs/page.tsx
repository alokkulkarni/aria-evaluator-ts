import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Terminal } from 'lucide-react'

import {
  GITHUB_URL,
  GITHUB_REPO,
  GITHUB_DISCUSSIONS_URL,
  GITHUB_CONTRIBUTING_URL,
  SLACK_URL,
} from '@/lib/site'

export const metadata: Metadata = {
  title: 'ARIA Documentation',
  description:
    'Documentation for ARIA Evaluator: quick start, core concepts (scenarios, adapters, the judge, dimensions), CLI usage, and how to self-host.',
}

const ARCHITECTURE_URL = `${GITHUB_URL}/blob/main/docs/ARCHITECTURE.md`

type DocLink = { label: string; href: string; external?: boolean }
type DocGroup = { title: string; items: DocLink[] }

const docNav: DocGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'What is ARIA Evaluator', href: '#what-is-aria' },
      { label: 'Architecture', href: '#architecture' },
    ],
  },
  {
    title: 'Get Started',
    items: [
      { label: 'Quick Start', href: '#quick-start' },
      { label: 'Run Locally', href: '#run-locally' },
      { label: 'Configuration', href: '#configuration' },
      { label: 'CLI Usage', href: '#cli-usage' },
      { label: 'Examples', href: '#examples' },
    ],
  },
  {
    title: 'Concepts',
    items: [
      { label: 'Scenarios', href: '#scenarios' },
      { label: 'Adapters', href: '#adapters' },
      { label: 'The Judge', href: '#the-judge' },
      { label: 'Dimensions', href: '#dimensions' },
      { label: 'Transcripts & Reports', href: '#reports' },
    ],
  },
  {
    title: 'Guides',
    items: [
      { label: 'Writing scenarios', href: '#writing-scenarios' },
      { label: 'Adding an adapter', href: '#adding-an-adapter' },
      { label: 'Security & compliance', href: '/security' },
      { label: 'AI agent evaluation 101', href: '/guides/what-is-ai-agent-evaluation' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { label: 'CLI commands', href: '#cli-commands' },
      { label: 'Architecture (GitHub)', href: ARCHITECTURE_URL, external: true },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'Contributing', href: GITHUB_CONTRIBUTING_URL, external: true },
      { label: 'Discussions', href: GITHUB_DISCUSSIONS_URL, external: true },
      { label: 'Slack', href: SLACK_URL, external: true },
    ],
  },
]

const dimensionGroups = [
  { group: 'Response Quality', dims: 'Correctness, Faithfulness, Helpfulness, Relevance, Conciseness' },
  { group: 'Task Completion', dims: 'Goal Success, Task Completion Rate' },
  { group: 'Safety & Security', dims: 'Guardrail Compliance, Prompt Injection Resistance, Bias & Fairness' },
  { group: 'Customer Experience', dims: 'Tone & Empathy, Clarity' },
  { group: 'Escalation & Vulnerability', dims: 'Escalation Appropriateness, Handover Quality, Vulnerability Detection' },
]

const cliCommands = [
  { cmd: 'npm run dev', desc: 'Run the API + UI at http://localhost:3001' },
  { cmd: 'npm run cli:connect -- --scenario=…', desc: 'Run a scenario against an Amazon Connect agent' },
  { cmd: 'npm run cli:lex -- --scenario=…', desc: 'Run against an Amazon Lex bot' },
  { cmd: 'npm run cli:azure -- --scenario=…', desc: 'Run against Azure Bot Service' },
  { cmd: 'npm run cli:openapi -- --scenario=…', desc: 'Run against any OpenAPI/REST endpoint' },
  { cmd: 'npm run cli:custom -- --scenario=…', desc: 'Run against a custom adapter' },
  { cmd: 'npm run lint', desc: 'Type-check (tsc --noEmit)' },
  { cmd: 'npm run build', desc: 'Build the API + UI' },
  { cmd: 'npm run db:migrate', desc: 'Apply Prisma schema changes' },
]

function externalProps(external?: boolean) {
  return external ? { target: '_blank' as const, rel: 'noreferrer noopener' } : {}
}

/** A section heading anchored for the sidebar; scroll-mt keeps it clear of the sticky navbar. */
function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/5 pt-10">
      <h2 className="font-display text-2xl font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <div className="max-w-8xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12">
        {/* ── Left sidebar ──────────────────────────────────────────────────── */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100vh-7rem)] space-y-6 overflow-y-auto pb-10 pr-2">
            {docNav.map((groupItem) => (
              <div key={groupItem.title}>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {groupItem.title}
                </p>
                <ul className="mt-2 border-l border-white/10">
                  {groupItem.items.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={item.href}
                        {...externalProps(item.external)}
                        className="-ml-px flex items-center gap-1 border-l border-transparent py-1.5 pl-3 text-sm text-slate-400 transition hover:border-cyan-300/60 hover:text-white"
                      >
                        {item.label}
                        {item.external ? <ArrowUpRight className="h-3 w-3 opacity-50" /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        {/* ── Main content ──────────────────────────────────────────────────── */}
        <div className="min-w-0 max-w-3xl">
          <p className="eyebrow">Documentation</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            ARIA Evaluator docs
          </h1>
          <p className="mt-5 text-base leading-8 text-slate-300">
            Everything you need to self-host ARIA Evaluator: get it running, understand the core
            concepts, and wire it up to the agents you want to test. ARIA is open source — clone the
            repo and follow along.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110"
            >
              View on GitHub
            </Link>
            <Link
              href={ARCHITECTURE_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-100 transition hover:border-white/30 hover:bg-white/10"
            >
              Architecture guide <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-10 space-y-10">
            <DocSection id="what-is-aria" title="What is ARIA Evaluator">
              <p>
                ARIA Evaluator is an open-source platform for testing conversational AI agents. You
                describe what a user wants in a <strong>scenario</strong>, ARIA runs that scenario
                against your agent through an <strong>adapter</strong>, and a panel of independent
                LLM <strong>judges</strong> scores the resulting transcript across 15 quality and
                safety dimensions — with security and compliance checks built in.
              </p>
              <p>
                It runs entirely on infrastructure you control. Bring your own model provider
                (Amazon Bedrock / Claude), define scenarios in YAML, and get a shareable report with
                per-dimension scores and the judges&rsquo; reasoning.
              </p>
            </DocSection>

            <DocSection id="architecture" title="Architecture">
              <p>The evaluation pipeline is a straight line:</p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-6 text-cyan-100">
                <code>Scenario (YAML) → Adapter → Conversation runner → Transcript → LLM Judge → EvalResult → Reports / Dashboard</code>
              </pre>
              <p>
                Stack: TypeScript · Express · React (Vite + Tailwind) · Prisma · SQLite (dev) /
                PostgreSQL (prod) · AWS Bedrock. The full directory map and deep-dives live in the{' '}
                <Link href={ARCHITECTURE_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-cyan-300 hover:text-cyan-200">
                  architecture guide
                </Link>
                .
              </p>
            </DocSection>

            <DocSection id="quick-start" title="Quick Start">
              <p>Clone the repo, install dependencies, and run a scenario against a sample endpoint:</p>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-500">
                  <Terminal className="h-3.5 w-3.5" /> bash
                </div>
                <pre className="overflow-x-auto bg-slate-950/60 p-4 text-xs leading-6 text-slate-200">
                  <code>{`git clone https://github.com/${GITHUB_REPO}.git
cd aria-evaluator-ts
npm install
npm run cli:openapi -- --scenario=examples/account-balance.yaml`}</code>
                </pre>
              </div>
            </DocSection>

            <DocSection id="run-locally" title="Run Locally">
              <p>
                Start the API and the browser dashboard together with <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">npm run dev</code>,
                then open <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">http://localhost:3001</code> to
                launch runs and watch transcripts stream in live.
              </p>
            </DocSection>

            <DocSection id="configuration" title="Configuration">
              <p>
                ARIA needs a model provider for the judge (and for agent-driven scenarios). Configure
                Amazon Bedrock / Claude credentials via environment variables, then point ARIA at the
                agent you want to test. Scenarios themselves are plain YAML files — no SDK changes to
                your agent are required.
              </p>
            </DocSection>

            <DocSection id="cli-usage" title="CLI Usage">
              <p>
                Each adapter has a CLI entry point. Pass a scenario file and ARIA runs the
                conversation, scores it, and writes a report:
              </p>
              <pre className="overflow-x-auto rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-6 text-slate-200">
                <code>{`npm run cli:openapi -- --scenario=examples/account-balance.yaml
# also: cli:connect, cli:lex, cli:azure, cli:custom`}</code>
              </pre>
            </DocSection>

            <DocSection id="examples" title="Examples">
              <p>
                The <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">examples/</code> directory
                ships scenario packs you can run as-is or copy — functional journeys, adversarial
                attacks, and escalation tests — so you can see scoring end-to-end before writing your
                own.
              </p>
            </DocSection>

            <DocSection id="scenarios" title="Scenarios">
              <p>
                A scenario is a YAML file describing a customer <strong>persona</strong>, a{' '}
                <strong>goal</strong>, and how the conversation should run. In{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">script</code> mode the
                turns are fixed; in <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">agent</code> mode
                a Claude-driven customer generates turns dynamically for a more realistic test.
                Security scenarios additionally declare an attack type.
              </p>
            </DocSection>

            <DocSection id="adapters" title="Adapters">
              <p>
                Adapters connect ARIA to the agent under test. Built-in adapters cover{' '}
                <strong>Amazon Connect</strong>, <strong>Amazon Lex</strong>,{' '}
                <strong>Azure Bot Service</strong>, <strong>Microsoft Copilot</strong>,{' '}
                <strong>OpenAPI / REST</strong>, and <strong>WebSocket</strong>. Each implements a
                small <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">BaseAdapter</code> contract
                (connect → sendMessage → receive → disconnect), so adding a new provider is
                self-contained.
              </p>
            </DocSection>

            <DocSection id="the-judge" title="The Judge">
              <p>
                Instead of a single model deciding the score, ARIA uses a <strong>panel of independent
                LLM judges</strong>. Quality scenarios are scored across all non-security dimensions;
                security scenarios are scored on guardrail compliance only. The overall score is a
                weighted average of the active dimensions, and a run passes when it clears the
                configurable threshold (default 0.7).
              </p>
            </DocSection>

            <DocSection id="dimensions" title="Dimensions">
              <p>Every conversation is scored across 15 dimensions in five groups:</p>
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody className="divide-y divide-white/5">
                    {dimensionGroups.map((row) => (
                      <tr key={row.group}>
                        <th scope="row" className="w-1/3 px-4 py-3 align-top font-medium text-white">{row.group}</th>
                        <td className="px-4 py-3 align-top text-slate-400">{row.dims}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DocSection>

            <DocSection id="reports" title="Transcripts & Reports">
              <p>
                Every run produces an immutable <strong>transcript</strong> and an{' '}
                <strong>EvalResult</strong> with per-dimension scores and the judges&rsquo; reasoning.
                Results are rendered as a shareable HTML report and a JSON artifact, and surfaced live
                in the dashboard while a run is in progress.
              </p>
            </DocSection>

            <DocSection id="writing-scenarios" title="Guide: Writing scenarios">
              <p>
                Start from a file in <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">examples/</code>,
                set the persona and goal, choose <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">script</code> or{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">agent</code> mode, and run it through the
                matching adapter CLI. For a conceptual primer, read{' '}
                <Link href="/guides/what-is-ai-agent-evaluation" className="font-medium text-cyan-300 hover:text-cyan-200">
                  What is AI agent evaluation?
                </Link>
              </p>
            </DocSection>

            <DocSection id="adding-an-adapter" title="Guide: Adding an adapter">
              <p>
                Implement the <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">BaseAdapter</code> contract
                (connect → sendMessage → receive → disconnect), return an{' '}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-cyan-200">AdapterMessage</code>, and register the
                provider in the conversation runner. The{' '}
                <Link href={ARCHITECTURE_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-cyan-300 hover:text-cyan-200">
                  architecture guide
                </Link>{' '}
                walks through it step by step.
              </p>
            </DocSection>

            <DocSection id="cli-commands" title="Reference: CLI commands">
              <div className="overflow-hidden rounded-xl border border-white/10">
                <table className="w-full border-collapse text-left text-sm">
                  <tbody className="divide-y divide-white/5">
                    {cliCommands.map((row) => (
                      <tr key={row.cmd}>
                        <td className="px-4 py-3 align-top">
                          <code className="whitespace-nowrap text-cyan-200">{row.cmd}</code>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-400">{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DocSection>

            <section className="scroll-mt-24 border-t border-white/5 pt-10">
              <div className="glass rounded-2xl p-6">
                <p className="eyebrow">Get involved</p>
                <h2 className="mt-2 font-display text-xl font-semibold text-white">Questions or contributions?</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Ask in <Link href={SLACK_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-cyan-300 hover:text-cyan-200">Slack</Link>{' '}
                  or <Link href={GITHUB_DISCUSSIONS_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-cyan-300 hover:text-cyan-200">GitHub Discussions</Link>, and see the{' '}
                  <Link href={GITHUB_CONTRIBUTING_URL} target="_blank" rel="noreferrer noopener" className="font-medium text-cyan-300 hover:text-cyan-200">contributing guide</Link>{' '}
                  to open your first PR.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
