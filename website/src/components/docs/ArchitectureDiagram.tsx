import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowDown,
  Bot,
  ClipboardCheck,
  Cpu,
  Database,
  FileBarChart,
  FileCode,
  GitMerge,
  LayoutDashboard,
  Layers,
  MessagesSquare,
  Plug,
  Scale,
  Server,
  ScrollText,
  Sparkles,
  Terminal,
  Users,
  Webhook,
} from 'lucide-react'

/** A labelled module pill inside a plane. */
function Module({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-slate-200 sm:text-[13px]">
      <Icon className="h-4 w-4 shrink-0 text-cyan-300" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

/** A bordered "plane" card grouping related modules. */
function Plane({
  label,
  children,
  highlight = false,
}: {
  label: string
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-4 sm:p-5',
        highlight ? 'border-cyan-300/30 bg-cyan-400/[0.04]' : 'border-white/10 bg-white/[0.02]',
      ].join(' ')}
    >
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      {children}
    </div>
  )
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center py-2 text-slate-600">
      <ArrowDown className="h-5 w-5" aria-hidden="true" />
      {label ? <span className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</span> : null}
    </div>
  )
}

/**
 * High-level architecture of ARIA Evaluator, shown on the docs Architecture page.
 * Plain semantic markup wrapped in `not-prose` so the docs-prose styles don't
 * touch it. Decorative only — the surrounding text carries the real detail.
 */
export function ArchitectureDiagram() {
  return (
    <figure className="not-prose my-2 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/40 p-4 sm:p-6">
      {/* Clients */}
      <Plane label="Clients">
        <div className="flex flex-wrap gap-2">
          <Module icon={Users} label="Security teams" />
          <Module icon={Users} label="Product teams" />
          <Module icon={Users} label="Platform teams" />
          <Module icon={FileCode} label="Scenarios (YAML)" />
        </div>
      </Plane>

      <FlowArrow />

      {/* Interfaces */}
      <Plane label="Interfaces">
        <div className="grid gap-2 sm:grid-cols-3">
          <Module icon={LayoutDashboard} label="Dashboard (React UI)" />
          <Module icon={Terminal} label="CLI" />
          <Module icon={Webhook} label="REST API + SSE" />
        </div>
      </Plane>

      <FlowArrow />

      {/* Evaluation Engine — the core */}
      <Plane label="Evaluation Engine" highlight>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Module icon={FileCode} label="Scenario loader" />
          <Module icon={MessagesSquare} label="Conversation runner (script · agent)" />
          <Module icon={Layers} label="Job queue (Redis / Bull)" />
          <Module icon={Server} label="API server (Express)" />
        </div>
      </Plane>

      <FlowArrow label="run & score" />

      {/* Adapter + Judge planes side by side */}
      <div className="grid gap-4 md:grid-cols-2">
        <Plane label="Adapter plane → agent under test">
          <div className="flex flex-wrap gap-2">
            <Module icon={Plug} label="Amazon Connect" />
            <Module icon={Plug} label="AWS Lex" />
            <Module icon={Plug} label="Azure / Copilot" />
            <Module icon={Plug} label="OpenAPI" />
            <Module icon={Plug} label="WebSocket" />
            <Module icon={Bot} label="Agent under test" />
          </div>
        </Plane>

        <Plane label="Judge plane">
          <div className="flex flex-wrap gap-2">
            <Module icon={Cpu} label="Amazon Bedrock (default)" />
            <Module icon={Sparkles} label="OpenAI · Azure · Anthropic · Gemini" />
            <Module icon={Scale} label="15 dimensions" />
            <Module icon={GitMerge} label="Aggregation & pass / fail" />
          </div>
        </Plane>
      </div>

      <FlowArrow />

      {/* Results & storage */}
      <Plane label="Results & Storage">
        <div className="flex flex-wrap gap-2">
          <Module icon={ScrollText} label="Transcripts (immutable)" />
          <Module icon={ClipboardCheck} label="EvalResult" />
          <Module icon={FileBarChart} label="Reports (HTML + JSON)" />
          <Module icon={Database} label="PostgreSQL" />
          <Module icon={Activity} label="Live dashboard" />
        </div>
      </Plane>

      <figcaption className="mt-4 text-center text-xs text-slate-500">
        ARIA Evaluator — high-level architecture. Self-hosted, bring-your-own model provider.
      </figcaption>
    </figure>
  )
}
