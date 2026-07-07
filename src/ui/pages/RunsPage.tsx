import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, toApiUrl } from '../lib/api.js';
import { usePlanGate } from '../lib/plan-gate.js';
import { formatTokenCount } from '../lib/format.js';
import { parseScenarioRef, domainLabel } from '../../shared/domains.js';
import { supportedChannels, isChatOnlyProvider, isVoiceWsProvider } from '../../shared/provider-channels.js';
import { fetchProviderInstances, type ProviderInstance } from '../lib/provider-instances.js';
import { StatusBadge } from './Dashboard.js';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CategoryBankingIcon,
  CategoryEdgeCasesIcon,
  CategoryEscalationIcon,
  CategoryGeneralIcon,
  ConversationIcon,
  ProviderAwsIcon,
  ProviderBotIcon,
  ProviderMicrosoftIcon,
  ProviderOpenApiIcon,
  RunAgentIcon,
  RunCustomerIcon,
  RunFailIcon,
  RunMarkerIcon,
  RunParallelIcon,
  RunPassIcon,
  RunRunningIcon,
  RunSecurityIcon,
  RunChatIcon,
  RunVoiceIcon,
  ScenarioAdversarialIcon,
} from '../components/icons.js';

interface Run {
  id: string;
  scenarioName: string;
  channel: string;
  status: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  audioPath?: string;
  evalResult?: {
    overallScore: number;
    passed: boolean;
    summary: string;
    scenarioType?: string;
    requiresHumanReview?: boolean | null;
    judgeTokenInputEstimate?: number | null;
    judgeTokenOutputEstimate?: number | null;
    judgeTokenTotalEstimate?: number | null;
  } | null;
  report?: { htmlPath: string; jsonPath: string } | null;
  scenarioRefsJson?: string | null;
  telemetry?: {
    provider?: string;
    providerInstanceId?: string | null;
    providerInstanceName?: string | null;
    tokenInputEstimate?: number | null;
    tokenOutputEstimate?: number | null;
    tokenTotalEstimate?: number | null;
  } | null;
  turns?: Array<{ index: number; role: string; content: string }>;
  transcripts?: Array<{ scenarioName: string }>;
}

interface ScenarioSummary {
  name: string;
  goal?: string;
  channel: 'chat' | 'voice';
  filePath?: string;
}

interface ScenarioOption {
  ref: string;
  name: string;
  goal?: string;
  channel: 'chat' | 'voice';
  filePath: string;
}

type Provider = 'connect' | 'lex' | 'azure' | 'strands' | 'copilot' | 'custom' | 'openapi' | 'websocket';

const ALL_PROVIDERS: ReadonlySet<string> = new Set<Provider>(['connect', 'lex', 'azure', 'strands', 'copilot', 'custom', 'openapi', 'websocket']);

// Channel capability (which providers can run voice) lives in the shared,
// unit-tested module src/shared/provider-channels.ts so the UI, API, and CLI
// agree. connect + the voice-WS providers (custom, strands, openapi, websocket)
// support voice; lex / azure / copilot are chat-only.

function fileNameFromPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).at(-1) ?? rawPath;
}

function toPublicArtifactUrl(rawPath: string, kind: 'reports' | 'transcripts'): string | null {
  if (!rawPath) return null;
  const normalized = rawPath.replace(/\\/g, '/');
  const marker = `/${kind}/`;
  const absoluteIdx = normalized.lastIndexOf(marker);
  if (absoluteIdx >= 0) {
    const tail = normalized.slice(absoluteIdx + marker.length);
    return toApiUrl(`/${kind}/${encodeURI(tail)}`);
  }
  const relativeIdx = normalized.lastIndexOf(`${kind}/`);
  if (relativeIdx >= 0) {
    const tail = normalized.slice(relativeIdx + `${kind}/`.length);
    return toApiUrl(`/${kind}/${encodeURI(tail)}`);
  }
  const name = fileNameFromPath(normalized);
  if (!name) return null;
  return toApiUrl(`/${kind}/${encodeURIComponent(name)}`);
}

function extractTranscriptPaths(logs: string[]): string[] {
  const seen = new Set<string>();
  for (const line of logs) {
    const m = line.match(/transcript saved\s*→\s*(.+\.json)\s*$/i);
    if (m?.[1]) seen.add(m[1].trim());
  }
  return [...seen];
}

function extractReportPaths(logs: string[]): { jsonPath: string | null; htmlPath: string | null } {
  let jsonPath: string | null = null;
  let htmlPath: string | null = null;
  for (const line of logs) {
    const jsonMatch = line.match(/^\s*JSON:\s*(.+\.json)\s*$/i);
    if (jsonMatch?.[1]) jsonPath = jsonMatch[1].trim();
    const htmlMatch = line.match(/^\s*HTML:\s*(.+\.html)\s*$/i);
    if (htmlMatch?.[1]) htmlPath = htmlMatch[1].trim();
  }
  return { jsonPath, htmlPath };
}

function toTranscriptViewerUrl(filename: string): string {
  return `/?page=transcripts&file=${encodeURIComponent(filename)}`;
}

// ── Live transcript parser ──────────────────────────────────────────────────

interface LiveTurn {
  role: 'customer' | 'agent';
  content: string;
}

interface LiveScenarioBlock {
  name: string;
  turns: LiveTurn[];
  /** null = still running, true = passed, false = failed */
  outcome: boolean | null;
  turnCount: number | null;
}

// ── Parallel execution helpers ────────────────────────────────────────────────

interface ParallelScenarioState {
  index: number;   // 1-based position in the parallel batch (from log line)
  total: number;
  status: 'running' | 'done' | 'failed';
  score: number | null;  // null = no judge / failed
  passed: boolean | null;
}

/** Returns true if the log stream represents a parallel run (>10 scenarios). */
function isParallelRun(logs: string[]): boolean {
  return logs.some((l) => /ℹ\s+Running \d+ scenarios in parallel/.test(l.replace(/\x1b\[[0-9;]*m/g, '')));
}

/** Parses parallel log lines into a map of scenarioName → state. */
function buildParallelProgress(logs: string[]): Map<string, ParallelScenarioState> {
  const map = new Map<string, ParallelScenarioState>();

  for (const raw of logs) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();

    // ▶ [parallel N/total] starting: Name
    const startMatch = line.match(/^▶\s+\[parallel\s+(\d+)\/(\d+)\]\s+starting:\s+(.+)$/);
    if (startMatch) {
      const index = Number(startMatch[1]);
      const total = Number(startMatch[2]);
      const name  = startMatch[3].trim();
      map.set(name, { index, total, status: 'running', score: null, passed: null });
      continue;
    }

    // ✅ [parallel N/total] done: Name (score X/10)
    // ❌ [parallel N/total] done: Name (score X/10)
    // ✅ [parallel N/total] done: Name   (no judge)
    const doneMatch = line.match(/^[✅❌]\s+\[parallel\s+(\d+)\/(\d+)\]\s+done:\s+(.+?)(?:\s+\(score\s+(\d+)\/10\))?$/);
    if (doneMatch) {
      const index = Number(doneMatch[1]);
      const total = Number(doneMatch[2]);
      const name  = doneMatch[3].trim();
      const score = doneMatch[4] !== undefined ? Number(doneMatch[4]) : null;
      const passed = line.startsWith('✅');
      map.set(name, { index, total, status: 'done', score, passed });
      continue;
    }

    // ✗ [parallel N/total] failed: Name: Error
    const failMatch = line.match(/^✗\s+\[parallel\s+(\d+)\/(\d+)\]\s+failed:\s+(.+?)(?::\s+.+)?$/);
    if (failMatch) {
      const index = Number(failMatch[1]);
      const total = Number(failMatch[2]);
      const name  = failMatch[3].trim();
      const existing = map.get(name);
      map.set(name, { index, total, status: 'failed', score: null, passed: false, ...(existing ?? {}) });
    }
  }

  return map;
}

/** Returns a Tailwind text-colour class for a terminal log line. */
function getTerminalLineClass(raw: string): string {
  const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (/^ℹ\s+Running \d+ scenarios in parallel/.test(line)) return 'text-yellow-300';
  if (/^▶\s+\[parallel/.test(line)) return 'text-cyan-300';
  if (/^✅\s+\[parallel/.test(line)) return 'text-green-400';
  if (/^❌\s+\[parallel/.test(line)) return 'text-red-400';
  if (/^✗\s+\[parallel/.test(line)) return 'text-red-400';
  if (/^✅\s+/.test(line)) return 'text-green-400';
  if (/^❌\s+/.test(line)) return 'text-red-400';
  if (/^▶\s+/.test(line)) return 'text-cyan-300';
  if (/^✓\s+/.test(line)) return 'text-green-400';
  if (/^✗\s+/.test(line) && !/\[parallel/.test(line)) return 'text-red-400';
  if (/^🏁/.test(line) || /^🎉/.test(line)) return 'text-yellow-300';
  if (/error|exception|failed/i.test(line)) return 'text-red-300';
  return 'text-slate-100';
}

// ── ParallelProgressBoard ────────────────────────────────────────────────────

function ParallelProgressBoard({ logs, isLive }: { logs: string[]; isLive: boolean }) {
  const progress = buildParallelProgress(logs);
  if (progress.size === 0) return null;

  const entries = Array.from(progress.entries()).sort(([, a], [, b]) => a.index - b.index);
  const total     = entries[0]?.[1].total ?? entries.length;
  const doneCount = entries.filter(([, s]) => s.status !== 'running').length;
  const runningCount = entries.filter(([, s]) => s.status === 'running').length;
  const passedCount = entries.filter(([, s]) => s.status === 'done' && s.passed).length;
  const failedCount = entries.filter(([, s]) => s.status !== 'running' && !s.passed).length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
          <span className="inline-flex items-center gap-1.5">
            <RunParallelIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Parallel Execution
          </span>
        </span>
        <div className="flex items-center gap-2 text-xs">
          {isLive && runningCount > 0 && (
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              {runningCount} running
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-green-400">
            <RunPassIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {passedCount}
          </span>
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-red-400">
              <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {failedCount}
            </span>
          )}
          <span className="text-slate-400">{doneCount}/{total}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Scenario grid */}
      <div className="grid grid-cols-1 gap-1 max-h-56 overflow-y-auto pr-1">
        {entries.map(([name, state]) => {
          const Icon =
            state.status === 'running' ? RunRunningIcon :
            state.status === 'failed' ? RunFailIcon :
            state.passed ? RunPassIcon : RunFailIcon;
          const rowColour =
            state.status === 'running'  ? 'text-cyan-300' :
            state.status === 'failed'   ? 'text-red-400' :
            state.passed                ? 'text-green-400' : 'text-red-400';

          return (
            <div key={name} className="flex items-center gap-2 text-xs">
              <span className={`w-4 flex-shrink-0 ${state.status === 'running' ? 'animate-pulse' : ''}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <span className={`flex-1 truncate ${rowColour}`} title={name}>{name}</span>
              {state.score !== null && (
                <span className={`flex-shrink-0 font-mono font-semibold ${state.passed ? 'text-green-400' : 'text-red-400'}`}>
                  {state.score}/10
                </span>
              )}
              {state.status === 'running' && (
                <span className="flex-shrink-0 text-slate-500 font-mono">…</span>
              )}
            </div>
          );
        })}
      </div>

      {!isLive && doneCount === total && (
        <p className="text-xs text-slate-400 text-center pt-1">
          <span className="inline-flex items-center gap-1.5">
            <RunPassIcon className="h-3.5 w-3.5" aria-hidden="true" />
            All {total} scenarios complete · {passedCount} passed · {failedCount} failed
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Parses raw terminal log lines into per-scenario conversation blocks.
 * Extracts:
 *  - Scenario headers:    "▶  <name>"  or  "▶ [parallel N/T] starting: <name>"
 *  - Opening greeting:    "🤖 agent (greeting): <text>"
 *  - Agent turns:         "🤖 agent: <text>"
 *  - Customer (script):   "🧑 customer: <text>"
 *  - Customer (speaking): "🎤 Speaking \"<text>\""
 *  - Completion lines:    "✓ <name> (N turns)" / "✗ <name> (N turns)"
 */
function parseLiveTranscript(logs: string[]): LiveScenarioBlock[] {
  const blocks: LiveScenarioBlock[] = [];
  let current: LiveScenarioBlock | null = null;

  for (const raw of logs) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '').trim(); // strip ANSI

    // Scenario start — handles both sequential and parallel format
    // sequential: "▶  Scenario Name"
    // parallel:   "▶ [parallel 1/63] starting: Scenario Name"
    const scenarioStart = line.match(/^▶\s+(?:\[parallel\s+\d+\/\d+\]\s+starting:\s+)?(.+)$/);
    if (scenarioStart) {
      const name = scenarioStart[1].trim();
      // For parallel runs, don't create duplicate blocks for the same scenario name
      const existing = blocks.find((b) => b.name === name);
      if (existing) {
        current = existing;
      } else {
        current = { name, turns: [], outcome: null, turnCount: null };
        blocks.push(current);
      }
      continue;
    }

    if (!current) continue;

    // Opening greeting — "🤖 agent (greeting): <text>"
    const greetingMatch = line.match(/🤖\s+agent\s*\(greeting\):\s*(.+)/);
    if (greetingMatch) {
      current.turns.push({ role: 'agent', content: greetingMatch[1].trim() });
      continue;
    }

    // Agent turn — "🤖 agent: <text>"
    const agentMatch = line.match(/🤖\s+agent:\s+(.+)/);
    if (agentMatch) {
      current.turns.push({ role: 'agent', content: agentMatch[1].trim() });
      continue;
    }

    // Customer turn from script log — "🧑 customer: <text>"
    const customerLogMatch = line.match(/🧑\s+customer:\s+(.+)/);
    if (customerLogMatch) {
      const text = customerLogMatch[1].replace(/…$/, '').trim();
      // Avoid duplicating if a 🎤 Speaking line for same text follows
      const last = current.turns.at(-1);
      if (!last || last.role !== 'customer' || last.content !== text) {
        current.turns.push({ role: 'customer', content: text });
      }
      continue;
    }

    // Customer turn from voice speaking line — "🎤 Speaking \"<text>\""
    // This arrives after the 🧑 customer log line in voice mode so deduplicate
    const customerMatch = line.match(/🎤\s+Speaking\s+"([^"]+)"/);
    if (customerMatch) {
      const text = customerMatch[1].replace(/…$/, '').trim();
      const last = current.turns.at(-1);
      if (!last || last.role !== 'customer') {
        current.turns.push({ role: 'customer', content: text });
      }
      continue;
    }

    // Scenario completion (✓ or ✗)
    const doneMatch = line.match(/^([✓✗])\s+(.+?)\s+\((\d+)\s+turns?\)/);
    if (doneMatch) {
      const target = [...blocks].reverse().find((b) => b.name === doneMatch[2]?.trim() || b.outcome === null);
      if (target) {
        target.outcome = doneMatch[1] === '✓';
        target.turnCount = Number.parseInt(doneMatch[3] ?? '0', 10);
      }
    }
  }

  return blocks.filter((b) => b.turns.length > 0);
}

function LiveTranscriptPanel({ logs, isLive }: { logs: string[]; isLive: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const blocks = parseLiveTranscript(logs);

  useEffect(() => {
    if (isLive) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs, isLive]);

  if (blocks.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase">Live Transcript</p>
        {isLive && (
          <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
            Live
          </span>
        )}
      </div>

      <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
        {blocks.map((block, bi) => (
          <div key={bi} className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {/* Scenario header */}
            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-600 truncate">{block.name}</span>
              {block.outcome !== null ? (
                <span className={`inline-flex items-center gap-1 text-xs font-bold ml-2 flex-shrink-0 ${block.outcome ? 'text-green-600' : 'text-red-500'}`}>
                  {block.outcome ? <RunPassIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {block.turnCount ?? 0} turns
                </span>
              ) : (
                <span className="text-xs text-slate-400 ml-2 flex-shrink-0 animate-pulse">running…</span>
              )}
            </div>

            {/* Conversation bubbles */}
            <div className="p-3 space-y-2">
              {block.turns.map((t, ti) => {
                const isAgent = t.role === 'agent';
                return (
                  <div key={ti} className={`flex gap-2 items-end ${isAgent ? '' : 'flex-row-reverse'}`}>
                    {isAgent
                      ? <RunAgentIcon className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                      : <RunCustomerIcon className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />}
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-snug max-w-[82%] ${
                      isAgent
                        ? 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        : 'bg-slate-950 text-white rounded-br-sm'
                    }`}>
                      {t.content}
                    </div>
                  </div>
                );
              })}
              {block.outcome === null && isLive && (
                <div className="flex gap-2 items-end">
                  <RunAgentIcon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Artifact preview modal ──────────────────────────────────────────────────

type ArtifactModalType = 'transcript' | 'json' | 'html' | 'report';

interface ArtifactModalState {
  url: string;
  label: string;
  type: ArtifactModalType;
  /** DB Run.id — threaded to the report's explain calls (the report's own runId is a transcript id). */
  runId?: string;
}

interface TranscriptData {
  scenarioName?: string;
  channel?: string;
  startedAt?: string;
  completedAt?: string;
  turns?: Array<{ index: number; role: string; content: string; durationMs?: number }>;
  evalResult?: { overallScore: number; passed: boolean; summary: string };
}

function TranscriptChatView({ url }: { url: string }) {
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: TranscriptData) => setData(d))
      .catch((e) => setError(String(e)));
  }, [url]);

  if (error) return <p className="text-red-500 p-4 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-400 p-4 text-sm animate-pulse">Loading transcript…</p>;

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Meta header */}
      <div className="bg-slate-50 rounded-lg p-4 space-y-1">
        <p className="font-bold text-slate-800 text-base">{data.scenarioName ?? 'Transcript'}</p>
        <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
          {data.channel && <span className={data.channel === 'voice' ? 'badge-voice' : 'badge-chat'}>{data.channel}</span>}
          {data.startedAt && <span>{new Date(data.startedAt).toLocaleString()}</span>}
          {data.evalResult && (
            <span className={`font-semibold ${data.evalResult.passed ? 'text-green-600' : 'text-red-600'}`}>
              {data.evalResult.passed ? '✅ PASS' : '❌ FAIL'} — {data.evalResult.overallScore.toFixed(1)}/10
            </span>
          )}
        </div>
        {data.evalResult?.summary && (
          <p className="text-xs text-slate-600 mt-1">{data.evalResult.summary}</p>
        )}
      </div>

      {/* Conversation turns */}
      <div className="space-y-3">
        {(data.turns ?? []).map((t, i) => {
          const isAgent = t.role === 'agent';
          const Icon = isAgent ? RunAgentIcon : RunCustomerIcon;
          return (
            <div key={i} className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}>
              <Icon className="mt-1.5 h-5 w-5 flex-shrink-0 self-end text-slate-500" aria-hidden="true" />
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isAgent ? 'bg-slate-100 text-slate-800 rounded-bl-sm' : 'bg-slate-950 text-white rounded-br-sm'
              }`}>
                <p>{t.content}</p>
                {t.durationMs && (
                  <p className={`text-[10px] mt-1 ${isAgent ? 'text-slate-400' : 'text-blue-200'}`}>
                    {(t.durationMs / 1000).toFixed(1)}s response
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ReportJudgeVote { judgeId: string; provider: string; modelId: string; score: number; justification?: string }
interface ReportTurnContribution { turnIndex: number; role: string; contentPreview: string; score: number }
interface ReportDimScore {
  score: number;
  justification: string;
  evidence?: string;
  judgeVotes?: ReportJudgeVote[];
  spread?: number;
  disagreement?: boolean;
  turnContributions?: ReportTurnContribution[];
}

// Dimensions for which on-demand turn-level Shapley attribution is available
// (must match src/judge/explain/explain-run.ts). TRACE dimensions instead carry
// per-turn contributions inline (turnContributions) and need no extra call.
const SECURITY_EXPLAINABLE = new Set(['guardrail_compliance', 'prompt_injection_resistance']);
const QUALITY_EXPLAINABLE = new Set([
  'goal_success', 'task_completion_rate', 'guardrail_compliance', 'prompt_injection_resistance', 'bias_and_fairness',
]);

function scoreColor(score: number): string {
  return score >= 7 ? 'bg-green-500' : score >= 5 ? 'bg-amber-500' : 'bg-red-500';
}

/** Phase 1: per-agent-turn scores that were averaged into a TRACE dimension. */
function TurnContributionBars({ contributions }: { contributions: ReportTurnContribution[] }) {
  return (
    <div className="mt-2 rounded-md bg-slate-50 border border-slate-100 p-2 space-y-1">
      <p className="text-xs font-semibold text-slate-700">Score per agent turn</p>
      <p className="text-[10px] text-slate-400 -mt-0.5">Each agent turn's own score for this dimension — these are averaged into the score above.</p>
      {contributions.map((c) => (
        <div key={c.turnIndex} className="flex items-center gap-2" title={c.contentPreview}>
          <span className="text-[10px] text-slate-500 w-12 flex-shrink-0">Turn {c.turnIndex}</span>
          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full ${scoreColor(c.score)}`} style={{ width: `${Math.max(2, c.score * 10)}%` }} />
          </div>
          <span className={`text-[10px] font-mono font-semibold w-8 text-right ${c.score >= 7 ? 'text-green-600' : c.score >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
            {c.score}/10
          </span>
        </div>
      ))}
    </div>
  );
}

interface ShapleyTurnValue { turnIndex: number; role: string; contentPreview: string; value: number }
interface TurnShapleyExplanation {
  dimensionId: string;
  baselineScore: number;
  fullScore: number;
  turns: ShapleyTurnValue[];
  coalitionsEvaluated: number;
  exact: boolean;
  judgeModel: string;
}

/** Phase 2: on-demand turn-level Shapley attribution for a SESSION/security dim. */
function DimensionExplain(
  { runId, dimensionId, scenarioName, scenarioType }:
  { runId: string; dimensionId: string; scenarioName?: string; scenarioType?: string },
) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [exp, setExp] = useState<TurnShapleyExplanation | null>(null);
  const [meta, setMeta] = useState<{ cached: boolean; tokensUsed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function explain(): Promise<void> {
    setStatus('loading');
    setError(null);
    try {
      const d = await apiFetch(`/api/runs/${runId}/explain`, {
        method: 'POST',
        body: JSON.stringify({ dimensionId, scenarioName, scenarioType }),
      }) as { explanation: TurnShapleyExplanation; cached: boolean; tokensUsed: number };
      setExp(d.explanation);
      setMeta({ cached: d.cached, tokensUsed: d.tokensUsed });
      setStatus('done');
    } catch (err) {
      setError(err instanceof ApiError ? (err.error ?? err.message) : (err as Error).message);
      setStatus('error');
    }
  }

  if (status === 'idle') {
    return (
      <button
        onClick={() => { void explain(); }}
        className="mt-2 text-[11px] px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100 transition-colors"
        title="Re-scores the conversation with each turn masked (temperature 0) to attribute this score to individual turns. Spends judge tokens."
      >
        🔍 Explain which turn caused this
      </button>
    );
  }
  if (status === 'loading') {
    return <p className="mt-2 text-[11px] text-slate-400 animate-pulse">Attributing turns (re-scoring masked variants)…</p>;
  }
  if (status === 'error') {
    return (
      <div className="mt-2 text-[11px] text-red-500">
        {error}
        <button onClick={() => { void explain(); }} className="ml-2 underline">retry</button>
      </div>
    );
  }
  if (!exp) return null;

  const maxAbs = Math.max(0.01, ...exp.turns.map((t) => Math.abs(t.value)));
  const ordered = [...exp.turns].sort((a, b) => a.turnIndex - b.turnIndex);
  const delta = (exp.fullScore - exp.baselineScore).toFixed(1);
  const dimLabel = dimensionId.replace(/_/g, ' ');
  const isSecurity = dimensionId === 'guardrail_compliance' || dimensionId === 'prompt_injection_resistance';
  return (
    <div className="mt-2 rounded-md bg-slate-50 border border-slate-100 p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-700">Which turns drove the {dimLabel} score?</p>
      <p className="text-[11px] leading-snug text-slate-500">
        Re-scoring the conversation with each agent turn removed gives a baseline of{' '}
        <strong>{exp.baselineScore}/10</strong>; the full conversation scores <strong>{exp.fullScore}/10</strong>.
        Each bar is that turn's share of the {delta}-point difference
        {isSecurity ? ' — how much that response helped hold the guardrail' : ''}.
      </p>
      <div className="flex items-center gap-3 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm bg-green-500" /> raised the score</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block w-2.5 h-2 rounded-sm bg-red-500" /> lowered the score</span>
      </div>
      <div className="space-y-1.5">
        {ordered.map((t) => {
          const positive = t.value >= 0;
          const widthPct = Math.max(3, (Math.abs(t.value) / maxAbs) * 100);
          return (
            <div key={t.turnIndex}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-16 flex-shrink-0">Turn {t.turnIndex} · {t.role === 'agent' ? 'agent' : 'cust'}</span>
                <span className="flex-1 h-2.5 rounded-full bg-slate-200 overflow-hidden">
                  <span className={`block h-full ${positive ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${widthPct}%` }} />
                </span>
                <span className={`text-[10px] font-mono font-semibold w-16 text-right ${positive ? 'text-green-600' : 'text-red-600'}`}>
                  {positive ? '+' : ''}{t.value.toFixed(1)} pts
                </span>
              </div>
              {t.contentPreview && (
                <p className="text-[10px] text-slate-400 italic truncate" style={{ paddingLeft: 72 }} title={t.contentPreview}>“{t.contentPreview}”</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-slate-400">
        Contributions sum to the {delta}-pt change · {exp.exact ? 'exact' : 'sampled'} · {exp.coalitionsEvaluated} re-scores · {exp.judgeModel.split('.').pop()}
        {meta && !meta.cached && meta.tokensUsed > 0 ? ` · ${formatTokenCount(meta.tokensUsed)} tokens` : ''}
        {meta?.cached ? ' · cached' : ''} · approximate, complements the judge’s rationale
      </p>
    </div>
  );
}
interface ReportJudgeRef { id: string; provider: string; modelId: string; role?: string }
interface ReportResult {
  scenarioName: string;
  overallScore: number;
  passed: boolean;
  summary?: string;
  scenarioType?: 'security' | 'quality';
  dimensionScores?: Record<string, ReportDimScore>;
  judges?: ReportJudgeRef[];
  judgeAgreement?: number;
  requiresHumanReview?: boolean;
  judgeBreakdown?: { judgeId: string; provider: string; modelId: string; costUsd: number | null }[];
}
interface ReportData {
  generatedAt?: string;
  runId?: string;
  results?: ReportResult[];
}

function ReportView({ url, runId }: { url: string; runId?: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(url, { credentials: 'include' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: ReportData) => setData(d))
      .catch((e) => setError(String(e)));
  }, [url]);

  if (error) return <p className="text-red-500 p-4 text-sm">{error}</p>;
  if (!data) return <p className="text-slate-400 p-4 text-sm animate-pulse">Loading report…</p>;

  const results = data.results ?? [];
  const qualityResults = results.filter((r) => r.scenarioType !== 'security');
  const securityResults = results.filter((r) => r.scenarioType === 'security');

  // Quality score is based only on quality scenarios; security tests are shown separately.
  const scoringResults = qualityResults.length > 0 ? qualityResults : results;
  const passed = results.filter((r) => r.passed).length;
  const avgScore = scoringResults.length
    ? scoringResults.reduce((s, r) => s + r.overallScore, 0) / scoringResults.length
    : 0;

  const renderResult = (r: ReportResult, i: number) => (
    <div key={i} className="border border-slate-200 rounded-lg overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 ${r.passed ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-slate-800 text-sm">{r.scenarioName}</p>
            {r.scenarioType === 'security' && (
              <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">
                <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                Security Test
              </span>
            )}
            {r.judges && r.judges.length > 1 && (
              <span
                className="inline-flex items-center gap-1 text-xs bg-cyan-100 text-cyan-700 rounded px-1.5 py-0.5 font-semibold"
                title={r.judges.map((j) => `${j.modelId} (${j.provider})`).join(', ')}
              >
                {r.judges.length}-judge committee
                {typeof r.judgeAgreement === 'number' && ` · ${Math.round(r.judgeAgreement * 100)}% agree`}
              </span>
            )}
            {r.requiresHumanReview && (
              <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 rounded px-1.5 py-0.5 font-semibold">
                ⚠ Judges disagreed — review
              </span>
            )}
            {(() => {
              const cost = (r.judgeBreakdown ?? []).reduce((s, b) => s + (b.costUsd ?? 0), 0);
              return cost > 0 ? (
                <span className="inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 rounded px-1.5 py-0.5" title="Estimated committee judge cost for this scenario">
                  ${cost.toFixed(4)} committee
                </span>
              ) : null;
            })()}
          </div>
          {r.summary && <p className="text-xs text-slate-600 mt-0.5">{r.summary}</p>}
        </div>
        <span className={`inline-flex items-center gap-1 text-base font-bold flex-shrink-0 ${r.passed ? 'text-green-600' : 'text-red-600'}`}>
          {r.passed ? <RunPassIcon className="h-4 w-4" aria-hidden="true" /> : <RunFailIcon className="h-4 w-4" aria-hidden="true" />}
          {r.overallScore.toFixed(1)}/10
        </span>
      </div>
      {r.dimensionScores && (
        <div className="divide-y divide-slate-100">
          {Object.entries(r.dimensionScores).map(([dim, ds]) => (
            <div key={dim} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 capitalize flex items-center gap-1.5">
                  {dim.replace(/_/g, ' ')}
                  {ds.disagreement && (
                    <span className="inline-flex items-center text-[10px] bg-amber-100 text-amber-800 rounded px-1 py-0.5 font-semibold" title={`Judges disagreed (spread ${ds.spread}/10)`}>
                      ⚠ disagreement
                    </span>
                  )}
                </p>
                <span className={`text-xs font-bold ${ds.score >= 7 ? 'text-green-600' : ds.score >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {ds.score}/10
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{ds.justification}</p>
              {ds.evidence && (
                <p className="text-[11px] text-slate-400 mt-1 italic border-l-2 border-slate-200 pl-2">{ds.evidence}</p>
              )}
              {ds.judgeVotes && ds.judgeVotes.length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ds.judgeVotes.map((v) => (
                    <span
                      key={v.judgeId}
                      className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 rounded px-1.5 py-0.5"
                      title={v.justification ?? ''}
                    >
                      <span className="font-semibold">{v.modelId}</span>
                      <span className={`font-bold ${v.score >= 7 ? 'text-green-600' : v.score >= 5 ? 'text-amber-600' : 'text-red-600'}`}>{v.score}/10</span>
                    </span>
                  ))}
                </div>
              )}
              {ds.turnContributions && ds.turnContributions.length > 1 && (
                <TurnContributionBars contributions={ds.turnContributions} />
              )}
              {runId && (r.scenarioType === 'security' ? SECURITY_EXPLAINABLE : QUALITY_EXPLAINABLE).has(dim) && (
                <DimensionExplain runId={runId} dimensionId={dim} scenarioName={r.scenarioName} scenarioType={r.scenarioType} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-5 space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: qualityResults.length > 0 ? 'Quality Score' : 'Overall Score',
            value: `${avgScore.toFixed(1)}/10`,
            color: 'text-slate-900',
          },
          { label: 'Passed', value: `${passed}/${results.length}`, color: 'text-green-600' },
          { label: 'Generated', value: data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '—', color: 'text-slate-600' },
        ].map((s) => (
          <div key={s.label} className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Security tests note */}
      {securityResults.length > 0 && qualityResults.length > 0 && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5 text-xs text-purple-800">
          <span className="inline-flex items-center gap-1">
            <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <strong>{securityResults.length} security test{securityResults.length > 1 ? 's' : ''}</strong> are shown separately below and excluded from the quality score.
          </span>
        </div>
      )}

      {/* Quality results */}
      {qualityResults.length > 0 && (
        <div className="space-y-3">
          {securityResults.length > 0 && (
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Quality Scenarios</p>
          )}
          {qualityResults.map(renderResult)}
        </div>
      )}

      {/* Security results */}
      {securityResults.length > 0 && (
        <div className="space-y-3">
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 uppercase tracking-wide">
            <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Security / Adversarial Tests
          </p>
          {securityResults.map(renderResult)}
        </div>
      )}

      {/* Fallback: all results when no type info */}
      {qualityResults.length === 0 && securityResults.length === 0 && results.map(renderResult)}
    </div>
  );
}

function ArtifactPreviewModal({
  url,
  label,
  type,
  runId,
  onClose,
}: ArtifactModalState & { onClose: () => void }) {
  const [jsonContent, setJsonContent] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (type !== 'json') return;
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setJsonContent(JSON.stringify(data, null, 2)))
      .catch((e) => setJsonError(String(e)));
  }, [url, type]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.18)] flex flex-col w-full max-w-3xl h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[75%]" title={label}>{label}</p>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 underline shrink-0">
              <span className="inline-flex items-center gap-1">
                Open in new tab
                <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none font-bold" aria-label="Close">
              <RunFailIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden rounded-b-xl">
          {type === 'transcript' && <TranscriptChatView url={url} />}
          {type === 'report' && <ReportView url={url} runId={runId} />}
          {type === 'json' && (
            <div className="h-full overflow-y-auto bg-slate-950 p-4 rounded-b-xl">
              {jsonError
                ? <p className="text-red-400 text-sm font-mono">{jsonError}</p>
                : jsonContent === null
                  ? <p className="text-slate-400 text-sm font-mono animate-pulse">Loading…</p>
                  : <pre className="text-xs text-slate-100 font-mono whitespace-pre-wrap break-words">{jsonContent}</pre>
              }
            </div>
          )}
          {type === 'html' && (
            <iframe
              src={url}
              title={label}
              className="w-full h-full rounded-b-xl border-0"
              sandbox="allow-scripts allow-same-origin allow-popups"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NewRunModal({
  onClose,
  onStarted,
  initialScenarioRefs,
  initialScenarioNames,
  initialProvider,
  initialProviderInstanceId,
  initialChannel,
}: {
  onClose: () => void;
  onStarted: (runId: string) => void;
  initialScenarioRefs?: string[];
  initialScenarioNames?: string[];
  initialProvider?: string;
  initialProviderInstanceId?: string | null;
  initialChannel?: 'chat' | 'voice';
}) {
  const seededProvider = initialProvider && ALL_PROVIDERS.has(initialProvider.toLowerCase())
    ? (initialProvider.toLowerCase() as Provider)
    : undefined;
  const [options, setOptions] = useState<ScenarioOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedScenarioRefs, setSelectedScenarioRefs] = useState<string[]>(initialScenarioRefs ?? []);
  const [channel, setChannel] = useState<'chat' | 'voice'>(initialChannel ?? 'chat');
  const [provider, setProvider] = useState<Provider>(seededProvider ?? 'connect');
  const [providerInstances, setProviderInstances] = useState<ProviderInstance[]>([]);
  const [providerInstanceId, setProviderInstanceId] = useState<string | null>(initialProviderInstanceId ?? null);
  // Domain-first selection: one domain per run.
  const [selectedDomain, setSelectedDomain] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedModalCategories, setCollapsedModalCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      apiFetch('/api/scenarios'),
      apiFetch('/api/settings').catch(() => ({ settings: {} })),
    ])
      .then(([scenariosData, settingsData]) => {
        const d = scenariosData as { scenarios: ScenarioSummary[] };
        const settings = settingsData as { settings?: Record<string, string> };
        const settingsMap = settings.settings ?? {};
        const list: ScenarioOption[] = [];
        for (const s of d.scenarios ?? []) {
          const ref = s.filePath ?? '';
          const filePath = ref.split('#')[0] ?? '';
          if (!ref || !filePath) continue;
          list.push({
            ref,
            name: s.name,
            goal: s.goal,
            channel: s.channel,
            filePath,
          });
        }
        list.sort((a, b) => a.filePath === b.filePath
          ? a.name.localeCompare(b.name)
          : a.filePath.localeCompare(b.filePath));
        setOptions(list);
        // Re-run fallback for runs without stored refs: resolve the original run's
        // scenario names to refs against the freshly-loaded catalog (best-effort —
        // unmatched names, e.g. renamed/deleted scenarios, are simply skipped).
        if ((initialScenarioRefs?.length ?? 0) === 0 && (initialScenarioNames?.length ?? 0) > 0) {
          const nameToRef = new Map<string, string>();
          for (const o of list) if (!nameToRef.has(o.name)) nameToRef.set(o.name, o.ref);
          const recovered = (initialScenarioNames ?? [])
            .map((n) => nameToRef.get(n))
            .filter((ref): ref is string => !!ref);
          if (recovered.length > 0) setSelectedScenarioRefs([...new Set(recovered)]);
        }
        // Don't override a re-run's seeded provider with the global default.
        if (!seededProvider) {
          const defaultProvider = (settingsMap['EVAL_PROVIDER_DEFAULT'] ?? 'connect').toLowerCase();
          if (ALL_PROVIDERS.has(defaultProvider)) {
            setProvider(defaultProvider);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supportedChannels(provider).includes(channel)) {
      setChannel('chat');
    }
  }, [provider, channel]);

  // Load configured instances for the selected provider type and pick one
  // (keep current if still valid -> seeded re-run instance -> default -> first).
  useEffect(() => {
    let cancelled = false;
    fetchProviderInstances(provider)
      .then((list) => {
        if (cancelled) return;
        setProviderInstances(list);
        setProviderInstanceId((current) => {
          const ids = new Set(list.map((i) => i.id));
          if (current && ids.has(current)) return current;
          if (initialProviderInstanceId && ids.has(initialProviderInstanceId)) return initialProviderInstanceId;
          const chosen = list.find((i) => i.isDefault) ?? list[0];
          return chosen ? chosen.id : null;
        });
      })
      .catch(() => { if (!cancelled) setProviderInstances([]); });
    return () => { cancelled = true; };
  }, [provider, initialProviderInstanceId]);

  const filtered = options.filter((o) =>
    (o.channel === channel || (channel === 'voice' && o.channel === 'chat'))
    && (
      o.filePath.toLowerCase().includes(search.toLowerCase())
      || o.name.toLowerCase().includes(search.toLowerCase())
      || (o.goal ?? '').toLowerCase().includes(search.toLowerCase())
    ),
  );

  // Domains present in the catalog (from the `<domain>/<type>/<file>` ref shape).
  const availableDomains = [...new Set(
    options.map((o) => parseScenarioRef(o.ref)?.domain).filter((d): d is string => !!d),
  )].sort();
  const activeDomain = availableDomains.includes(selectedDomain)
    ? selectedDomain
    : (availableDomains[0] ?? '');

  function toggleScenario(ref: string): void {
    setSelectedScenarioRefs((prev) =>
      prev.includes(ref) ? prev.filter((p) => p !== ref) : [...prev, ref],
    );
  }

  function toggleSelectCategory(refs: string[]): void {
    const allSelected = refs.every(r => selectedScenarioRefs.includes(r));
    if (allSelected) {
      setSelectedScenarioRefs(prev => prev.filter(r => !refs.includes(r)));
    } else {
      setSelectedScenarioRefs(prev => [...new Set([...prev, ...refs])]);
    }
  }

  function toggleModalCat(key: string): void {
    setCollapsedModalCategories(prev => {
      const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
    });
  }

  function modalFmt(s: string): string {
    return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  async function startRun(): Promise<void> {
    if (selectedScenarioRefs.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const data = await apiFetch('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ scenarioRefs: selectedScenarioRefs, channel, provider, providerInstanceId }),
      }) as { runId: string };
      onStarted(data.runId);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.error ?? err.message : (err as Error).message);
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.18)] w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">New Evaluation Run</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="Close">
            <RunFailIcon className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Search scenarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500 mt-2">
            Pick a domain, then its scenarios. Voice runs selected scenarios in a single WebRTC session.
          </p>
        </div>

        {availableDomains.length > 0 && (
          <div className="px-6 pt-1 pb-2 flex items-center gap-2 flex-wrap border-b border-slate-100">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mr-1">Domain</span>
            {availableDomains.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => { if (d !== activeDomain) { setSelectedDomain(d); setSelectedScenarioRefs([]); } }}
                className={`text-sm px-3 py-1 rounded-full font-medium transition-colors ${
                  d === activeDomain ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {domainLabel(d)}
              </button>
            ))}
          </div>
        )}

        <div className="px-6 overflow-y-auto flex-1 py-2 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No scenarios match.</p>
          ) : (() => {
            // Within the active domain, group by type (adversarial/functional) → file.
            // Scenarios outside the `<domain>/<type>/<file>` layout are ignored.
            const grouped = new Map<string, Map<string, ScenarioOption[]>>();
            for (const o of filtered) {
              const parsed = parseScenarioRef((o.ref ?? o.filePath ?? '').replace(/\\/g, '/'));
              if (!parsed || parsed.domain !== activeDomain) continue;
              const cat = parsed.type; // 'adversarial' | 'functional'
              const sub = parsed.file.replace(/\.(ya?ml)$/i, '');
              if (!grouped.has(cat)) grouped.set(cat, new Map());
              const subMap = grouped.get(cat)!;
              if (!subMap.has(sub)) subMap.set(sub, []);
              subMap.get(sub)!.push(o);
            }
            if (grouped.size === 0) {
              return <p className="text-slate-400 text-sm py-4 text-center">No scenarios in this domain{search ? ' match your search' : ''}.</p>;
            }
            const catMeta: Record<string, { icon: React.ComponentType<{ className?: string }>; hdr: string }> = {
              adversarial: { icon: ScenarioAdversarialIcon, hdr: 'bg-red-50 text-red-800 border-red-200' },
              functional:  { icon: CategoryBankingIcon, hdr: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
              general:     { icon: CategoryGeneralIcon, hdr: 'bg-slate-50 text-slate-700 border-slate-200' },
            };

            return Array.from(grouped.entries()).map(([cat, subMap]) => {
              const meta = catMeta[cat] ?? catMeta.general!;
              const allRefs = Array.from(subMap.values()).flat().map(o => o.ref);
              const selectedCount = allRefs.filter(r => selectedScenarioRefs.includes(r)).length;
              const allChecked = allRefs.length > 0 && selectedCount === allRefs.length;
              const someChecked = selectedCount > 0 && !allChecked;
              const collapsed = collapsedModalCategories.has(cat);

              return (
                <div key={cat} className={`rounded-xl border overflow-hidden ${meta.hdr}`}>
                  {/* Category header with select-all tri-state checkbox */}
                  <div className={`flex items-center gap-2 px-3 py-2.5 border-b ${meta.hdr}`}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked; }}
                      onChange={() => toggleSelectCategory(allRefs)}
                      className="rounded"
                    />
                    <button
                      onClick={() => toggleModalCat(cat)}
                      className="flex-1 flex items-center justify-between text-left font-semibold text-sm">
                      <span className="flex items-center gap-2">
                        <meta.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span>{modalFmt(cat)}</span>
                        <span className="text-xs font-normal opacity-70">
                          {selectedCount > 0 ? `${selectedCount}/` : ''}{allRefs.length}
                        </span>
                      </span>
                      <span className="text-xs text-slate-400">
                        {collapsed ? <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                      </span>
                    </button>
                  </div>

                  {!collapsed && (
                    <div className="bg-white divide-y divide-slate-50">
                      {Array.from(subMap.entries()).map(([sub, items]) => {
                        const subRefs = items.map(o => o.ref);
                        const subSelected = subRefs.filter(r => selectedScenarioRefs.includes(r)).length;
                        const subAllChecked = subRefs.length > 0 && subSelected === subRefs.length;
                        const subSomeChecked = subSelected > 0 && !subAllChecked;
                        return (
                          <div key={sub}>
                            {/* Sub-category row */}
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50">
                              <input
                                type="checkbox"
                                checked={subAllChecked}
                                ref={el => { if (el) el.indeterminate = subSomeChecked; }}
                                onChange={() => toggleSelectCategory(subRefs)}
                                className="rounded"
                              />
                              <span className="text-xs font-semibold text-slate-500">
                                {modalFmt(sub)}
                                <span className="font-normal ml-1 opacity-60">
                                  ({subSelected > 0 ? `${subSelected}/` : ''}{items.length})
                                </span>
                              </span>
                            </div>
                            {items.map((o) => {
                              const checked = selectedScenarioRefs.includes(o.ref);
                              return (
                                <label
                                  key={o.ref}
                                  className={`flex items-start gap-3 px-4 py-2 cursor-pointer transition-colors text-sm ${
                                    checked ? 'bg-blue-50' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => toggleScenario(o.ref)}
                                    className="mt-0.5 rounded"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-800">{o.name}</p>
                                    {o.goal && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{o.goal}</p>}
                                  </div>
                                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${
                                    o.channel === 'voice' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {o.channel === 'voice'
                                      ? <RunVoiceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                      : <RunChatIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                                    {o.channel}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Provider:</span>
              {(['connect', 'lex', 'azure', 'strands', 'copilot', 'custom', 'openapi', 'websocket'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setProvider(p)}
                  title={isChatOnlyProvider(p) ? 'Chat only — this bot provider does not support voice' : undefined}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                    provider === p
                      ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p === 'connect' && <ProviderAwsIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'lex' && <ProviderBotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'azure' && <ProviderMicrosoftIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'strands' && <ProviderBotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'copilot' && <ProviderMicrosoftIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'custom' && <ProviderBotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'openapi' && <ProviderOpenApiIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p === 'websocket' && <ProviderBotIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  <span>{p}</span>
                  {isChatOnlyProvider(p) && (
                    <RunChatIcon
                      className={`h-3 w-3 shrink-0 ${provider === p ? 'text-blue-200' : 'text-slate-400'}`}
                      aria-label="chat only"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500 font-medium">Instance:</span>
              {providerInstances.length > 0 ? (
                <select
                  value={providerInstanceId ?? ''}
                  onChange={(e) => setProviderInstanceId(e.target.value || null)}
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {providerInstances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.nickname}{inst.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-amber-600">
                  No instances configured for this provider — using legacy settings. Add one in Settings → Provider Instances.
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Channel:</span>
              {(supportedChannels(provider)).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    channel === c
                      ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="inline-flex items-center gap-1">
                    {c === 'chat'
                      ? <RunChatIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      : <RunVoiceIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    {c === 'chat' ? 'Chat' : 'Voice'}
                  </span>
                </button>
              ))}
              {isChatOnlyProvider(provider) && (
                <span className="text-xs text-slate-400 italic">
                  Voice is not available for chat-only bot providers (lex, azure, copilot)
                </span>
              )}
              {isVoiceWsProvider(provider) && (
                <span className="text-xs text-slate-400 italic">
                  Voice runs over a bidirectional-audio WebSocket — set the Voice fields (protocol + WS URL) on this provider instance in Settings.
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">{selectedScenarioRefs.length} scenario(s) selected</span>
          </div>

          {error && (
            <p className="inline-flex items-center gap-1 text-xs text-red-600">
              <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button
              disabled={selectedScenarioRefs.length === 0 || running}
              onClick={startRun}
              className="btn-primary flex-1 text-sm disabled:opacity-40"
            >
              {running ? 'Starting…' : (
                <span className="inline-flex items-center gap-1.5">
                  <RunRunningIcon className="h-4 w-4" aria-hidden="true" />
                  Start Run
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RunsPage({ autoOpenModal, onModalAutoOpened }: { autoOpenModal?: boolean; onModalAutoOpened?: () => void }) {
  const { isBlocked, showUpgradeNudge, refresh: refreshPlan } = usePlanGate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [rerunSeed, setRerunSeed] = useState<{ refs: string[]; names?: string[]; provider?: string; providerInstanceId?: string | null; channel?: 'chat' | 'voice' } | null>(null);
  const [artifactModal, setArtifactModal] = useState<ArtifactModalState | null>(null);
  const [queueingRunId, setQueueingRunId] = useState<string | null>(null);
  const [queueMessage, setQueueMessage] = useState<{ runId: string; text: string; ok: boolean } | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadRuns();
    const interval = setInterval(loadRuns, 5000);
    return () => {
      clearInterval(interval);
      if (esRef.current) esRef.current.close();
    };
  }, []);

  useEffect(() => {
    if (autoOpenModal) {
      setShowModal(true);
      onModalAutoOpened?.();
    }
  }, [autoOpenModal]);

  function loadRuns(): void {
    apiFetch('/api/runs')
      .then((d: { runs: Run[] }) => {
        setRuns(d.runs ?? []);
        if (selected) {
          const stillVisible = (d.runs ?? []).some((r) => r.id === selected.id);
          if (!stillVisible) setSelected(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  async function fetchRunDetail(runId: string): Promise<Run | null> {
    try {
      const d = await apiFetch(`/api/runs/${runId}`) as { run: Run };
      return d.run ?? null;
    } catch {
      return null;
    }
  }

  async function fetchRunLogs(runId: string): Promise<string[]> {
    try {
      const d = await apiFetch(`/api/runs/${runId}/logs`) as { logs?: string[] };
      return Array.isArray(d.logs) ? d.logs : [];
    } catch {
      return [];
    }
  }

  function openNewRun(): void {
    if (isBlocked('run')) { showUpgradeNudge('run'); return; }
    setRerunSeed(null);
    setShowModal(true);
  }

  // Re-run: reopen the run modal pre-filled with the original run's scenarios,
  // provider and channel, so the user just confirms instead of re-selecting.
  function rerunFrom(run: Run): void {
    if (isBlocked('run')) { showUpgradeNudge('run'); return; }
    let refs: string[] = [];
    try { refs = run.scenarioRefsJson ? JSON.parse(run.scenarioRefsJson) as string[] : []; } catch { refs = []; }
    // Older runs predate scenarioRefsJson — fall back to recovering the selection by
    // matching the run's per-scenario names against the catalog (best-effort).
    const names = refs.length === 0
      ? [...new Set((run.transcripts ?? []).map((t) => t.scenarioName).filter(Boolean))]
      : undefined;
    setRerunSeed({
      refs,
      names,
      provider: run.telemetry?.provider,
      providerInstanceId: run.telemetry?.providerInstanceId ?? null,
      channel: run.channel === 'voice' ? 'voice' : 'chat',
    });
    setShowModal(true);
  }

  function handleRunStarted(runId: string): void {
    refreshPlan();
    loadRuns();
    setTimeout(async () => {
      const full = await fetchRunDetail(runId);
      if (full) selectRun(full);
    }, 500);
  }

  async function selectRun(run: Run): Promise<void> {
    const full = await fetchRunDetail(run.id);
    const target = full ?? run;

    setSelected(target);
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    if (target.status === 'running' || target.status === 'evaluating' || target.status === 'pending') {
      // For live runs, start empty — SSE replay (with Last-Event-ID dedup) populates the log.
      setLiveEvents([]);
      const es = new EventSource(toApiUrl(`/api/runs/${target.id}/events`), { withCredentials: true });
      esRef.current = es;
      es.addEventListener('queued', (e) => {
        const d = JSON.parse(e.data) as { message?: string };
        setLiveEvents((prev) => [...prev, d.message ?? 'Run queued']);
      });
      es.addEventListener('start', (e) => {
        const d = JSON.parse(e.data) as {
          message?: string;
          provider?: string;
          channel?: string;
          scenarioCount?: number;
        };
        const fallback = `Run started (${d.provider ?? 'unknown'} · ${d.channel ?? 'chat'} · ${d.scenarioCount ?? 0} scenario(s))`;
        setLiveEvents((prev) => [...prev, d.message ?? fallback]);
      });
      es.addEventListener('log', (e) => {
        const d = JSON.parse(e.data);
        setLiveEvents((prev) => [...prev, d.message]);
      });
      es.addEventListener('complete', async (e) => {
        const d = JSON.parse(e.data);
        setLiveEvents((prev) => [...prev, d.summary ? d.summary : 'Run completed']);
        es.close();
        esRef.current = null;
        // Reload both run detail and persisted logs — mirrors what a page refresh does,
        // ensuring audioPath, report paths, and transcript links are all visible immediately.
        const [refreshed, persistedLogs] = await Promise.all([
          fetchRunDetail(target.id),
          fetchRunLogs(target.id),
        ]);
        if (refreshed) setSelected(refreshed);
        if (persistedLogs.length > 0) setLiveEvents(persistedLogs);
        loadRuns();
      });
      es.addEventListener('failed', async (e) => {
        const d = JSON.parse(e.data);
        setLiveEvents((prev) => [...prev, `Failed: ${d.error}`]);
        es.close();
        esRef.current = null;
        const [refreshed, persistedLogs] = await Promise.all([
          fetchRunDetail(target.id),
          fetchRunLogs(target.id),
        ]);
        if (refreshed) setSelected(refreshed);
        if (persistedLogs.length > 0) setLiveEvents(persistedLogs);
        loadRuns();
      });
    } else {
      // For already-finished runs, load persisted logs via REST (no SSE needed).
      const persistedLogs = await fetchRunLogs(target.id);
      setLiveEvents(persistedLogs);
    }
  }

  async function queueForReview(runId: string): Promise<void> {
    setQueueingRunId(runId);
    setQueueMessage(null);
    try {
      await apiFetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId }),
      });
      setQueueMessage({ runId, text: 'Queued for review', ok: true });
    } catch (err) {
      const message = (err as Error).message;
      const isDuplicate = message.toLowerCase().includes('already exists');
      setQueueMessage({ runId, text: isDuplicate ? 'Already in review queue' : message, ok: isDuplicate });
    } finally {
      setQueueingRunId(null);
    }
  }

  async function deleteRun(runId: string): Promise<void> {
    const ok = window.confirm('Delete this run from the portal view?');
    if (!ok) return;
    try {
      await apiFetch(`/api/runs/${runId}`, { method: 'DELETE' });
      if (selected?.id === runId) setSelected(null);
      loadRuns();
    } catch {
      // ignore
    }
  }

  return (
    <>
      {showModal && (
        <NewRunModal
          onClose={() => { setShowModal(false); setRerunSeed(null); }}
          onStarted={handleRunStarted}
          initialScenarioRefs={rerunSeed?.refs}
          initialScenarioNames={rerunSeed?.names}
          initialProvider={rerunSeed?.provider}
          initialProviderInstanceId={rerunSeed?.providerInstanceId}
          initialChannel={rerunSeed?.channel}
        />
      )}

      {artifactModal && (
        <ArtifactPreviewModal
          url={artifactModal.url}
          label={artifactModal.label}
          type={artifactModal.type}
          runId={artifactModal.runId}
          onClose={() => setArtifactModal(null)}
        />
      )}

      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Run operations</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Evaluation Runs</h2>
            <p className="text-sm leading-6 text-slate-200/80">{runs.length} visible run(s)</p>
          </div>
        </section>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 md:hidden">Evaluation Runs</h2>
          </div>
          <button onClick={() => openNewRun()} className="btn-primary">
            <span className="inline-flex items-center gap-1.5">
              <RunRunningIcon className="h-4 w-4" aria-hidden="true" />
              New Run
            </span>
          </button>
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          <div className="md:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-slate-400 text-sm">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="card text-center space-y-3 py-8">
                <p className="text-slate-400 text-sm">No runs yet.</p>
                <button onClick={() => openNewRun()} className="btn-primary text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <RunRunningIcon className="h-4 w-4" aria-hidden="true" />
                    New Run
                  </span>
                </button>
              </div>
            ) : (
              runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => { void selectRun(r); }}
                  className={`card cursor-pointer transition-all text-sm ${
                    selected?.id === r.id ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{r.scenarioName}</p>
                      <p className="text-xs text-slate-400">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={r.channel === 'voice' ? 'badge-voice' : 'badge-chat'}>{r.channel}</span>
                      {r.evalResult?.scenarioType === 'security' && (
                        <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">
                          <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      )}
                      {r.evalResult && (
                        <span className={r.evalResult.passed ? 'text-green-700 font-bold text-xs' : 'text-red-600 font-bold text-xs'}>
                          {r.evalResult.overallScore.toFixed(1)}/10
                        </span>
                      )}
                      {r.evalResult?.requiresHumanReview && (
                        <span
                          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-700"
                          title="Committee judges disagreed — queued for human review"
                        >
                          ⚠ Needs review
                        </span>
                      )}
                    </div>
                    {(r.evalResult != null) || r.telemetry?.tokenTotalEstimate != null ? (
                      <div className="text-right">
                        <p className="text-[11px] font-semibold text-slate-800">
                          Judge {r.evalResult != null ? formatTokenCount(r.evalResult.judgeTokenTotalEstimate ?? 0) : '—'}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          Scenario {r.telemetry?.tokenTotalEstimate != null ? formatTokenCount(r.telemetry.tokenTotalEstimate) : '—'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); void deleteRun(r.id); }}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline font-medium"
                      title="Delete run"
                    >
                      <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="md:col-span-3">
            {selected ? (
              <div className="card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-lg">{selected.scenarioName}</h3>
                    <p className="text-xs text-slate-400 font-mono break-all">{selected.id}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selected.status} />
                    <button onClick={() => rerunFrom(selected)} className="btn-primary text-xs py-1 px-3">
                      <span className="inline-flex items-center gap-1">
                        <RunRunningIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Re-run
                      </span>
                    </button>
                    <button
                      onClick={() => { void deleteRun(selected.id); }}
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      <span className="inline-flex items-center gap-1">
                        <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        Delete
                      </span>
                    </button>
                  </div>
                </div>

                {selected.evalResult && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`inline-flex items-center gap-1 text-sm font-semibold ${selected.evalResult.passed ? 'text-green-700' : 'text-red-600'}`}>
                          {selected.evalResult.passed
                            ? <RunPassIcon className="h-4 w-4" aria-hidden="true" />
                            : <RunFailIcon className="h-4 w-4" aria-hidden="true" />}
                          {selected.evalResult.passed ? 'PASS' : 'FAIL'} — {selected.evalResult.overallScore.toFixed(1)}/10
                        </p>
                        {selected.evalResult.scenarioType === 'security' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">
                            <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Security Test
                          </span>
                        )}
                        {selected.evalResult.scenarioType === 'mixed' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">
                            <RunSecurityIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Contains Security Tests
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => { void queueForReview(selected.id); }}
                        disabled={queueingRunId === selected.id}
                        className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-40"
                        title="Add to judge calibration review queue"
                      >
                        {queueingRunId === selected.id ? 'Queuing…' : (
                          <span className="inline-flex items-center gap-1">
                            <RunMarkerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Queue for Review
                          </span>
                        )}
                      </button>
                    </div>
                    {queueMessage?.runId === selected.id && (
                      <p className={`text-xs mt-1 ${queueMessage.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {queueMessage.text}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">{selected.evalResult.summary}</p>
                    {(selected.evalResult != null || selected.telemetry?.tokenTotalEstimate != null) && (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                          Judge tokens: <strong>{formatTokenCount(selected.evalResult.judgeTokenTotalEstimate ?? 0)}</strong>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-700">
                          Scenario tokens: <strong>{selected.telemetry?.tokenTotalEstimate != null ? formatTokenCount(selected.telemetry.tokenTotalEstimate) : '—'}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {selected.errorMessage && (
                  <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                    <span className="inline-flex items-center gap-1">
                      <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                      {selected.errorMessage}
                    </span>
                  </div>
                )}

                {liveEvents.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Terminal Output</p>
                    <div className="bg-slate-900 rounded-lg p-3 text-xs font-mono max-h-96 overflow-y-auto space-y-0.5 whitespace-pre-wrap">
                      {liveEvents.map((e, i) => (
                        <div key={i} className={getTerminalLineClass(e)}>{e}</div>
                      ))}
                      {(selected.status === 'running' || selected.status === 'evaluating') && (
                        <div className="animate-pulse text-slate-400">…</div>
                      )}
                    </div>
                  </div>
                )}

                {liveEvents.length > 0 && isParallelRun(liveEvents) && (
                  <ParallelProgressBoard
                    logs={liveEvents}
                    isLive={selected.status === 'running' || selected.status === 'evaluating'}
                  />
                )}

                {liveEvents.length > 0 && !isParallelRun(liveEvents) && (
                  <LiveTranscriptPanel
                    logs={liveEvents}
                    isLive={selected.status === 'running' || selected.status === 'evaluating'}
                  />
                )}

                {(() => {
                  const transcriptPaths = extractTranscriptPaths(liveEvents);
                  const reportPaths = extractReportPaths(liveEvents);
                  const transcriptLinks = transcriptPaths
                    .map((p) => {
                      const name = fileNameFromPath(p);
                      const rawUrl = toPublicArtifactUrl(p, 'transcripts');
                      if (!rawUrl) return null;
                      return {
                        name,
                        rawUrl,
                        viewerUrl: toTranscriptViewerUrl(name),
                      };
                    })
                    .filter((x): x is { name: string; rawUrl: string; viewerUrl: string } => !!x);
                  const reportJsonPath = selected.report?.jsonPath ?? reportPaths.jsonPath;
                  const reportHtmlPath = selected.report?.htmlPath
                    ?? reportPaths.htmlPath
                    ?? (reportJsonPath?.replace(/\.json$/i, '.html') ?? null);
                  const reportHtmlUrl = reportHtmlPath ? toPublicArtifactUrl(reportHtmlPath, 'reports') : null;
                  const reportJsonUrl = reportJsonPath ? toPublicArtifactUrl(reportJsonPath, 'reports') : null;
                  const audioUrl = selected.audioPath
                    ? toApiUrl(`/audio/${encodeURIComponent(selected.audioPath)}`)
                    : null;
                  if (!reportHtmlUrl && !reportJsonUrl && transcriptLinks.length === 0 && !audioUrl) return null;

                  const btnClass = 'px-2.5 py-1 rounded-md border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 text-left';
                  return (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Run Artifacts</p>
                      <div className="flex flex-wrap gap-2">
                        {transcriptLinks.map((t) => (
                          <React.Fragment key={t.rawUrl}>
                            <button
                              className={btnClass}
                              title={t.name}
                              onClick={() => setArtifactModal({ url: t.rawUrl, label: t.name, type: 'json' })}
                            >
                              <span className="inline-flex items-center gap-1">
                                <RunMarkerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                {t.name}
                              </span>
                            </button>
                            <button
                              className={btnClass}
                              title={`Transcript conversation — ${t.name}`}
                              onClick={() => setArtifactModal({ url: t.rawUrl, label: `Transcript: ${t.name}`, type: 'transcript' })}
                            >
                              <span className="inline-flex items-center gap-1">
                                <ConversationIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                Transcript HTML
                              </span>
                            </button>
                          </React.Fragment>
                        ))}
                        {reportHtmlUrl && (
                          <button
                            className={btnClass}
                            title={reportHtmlPath ?? undefined}
                            onClick={() => setArtifactModal({ url: reportHtmlUrl, label: 'HTML Report', type: 'html' })}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RunParallelIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              HTML report
                            </span>
                          </button>
                        )}
                        {reportJsonUrl && (
                          <button
                            className={btnClass}
                            title={reportJsonPath ?? undefined}
                            onClick={() => setArtifactModal({ url: reportJsonUrl, label: 'JSON Report', type: 'report', runId: selected.id })}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RunMarkerIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              JSON report
                            </span>
                          </button>
                        )}
                        {audioUrl && (
                          <a
                            href={audioUrl}
                            download={selected.audioPath ?? undefined}
                            className={`${btnClass} inline-flex items-center`}
                            title={selected.audioPath ?? 'Voice recording WAV'}
                          >
                            <span className="inline-flex items-center gap-1">
                              <RunVoiceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                              Voice recording
                            </span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selected.audioPath && (
                  <div>
                    <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                      <RunVoiceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      Voice Recording
                    </p>
                    <audio controls className="w-full rounded-lg" crossOrigin="use-credentials" src={toApiUrl(`/audio/${encodeURIComponent(selected.audioPath)}`)}>
                      Your browser does not support the audio element.
                    </audio>
                    <p className="text-xs text-slate-400 mt-1 font-mono">{selected.audioPath}</p>
                  </div>
                )}

                {selected.turns && selected.turns.length > 0 && liveEvents.length === 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Transcript</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selected.turns.map((t, i) => (
                        <div key={`${t.index}-${i}`} className={`flex gap-2 ${t.role === 'customer' ? '' : 'flex-row-reverse'}`}>
                          {t.role === 'customer'
                            ? <RunCustomerIcon className="h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden="true" />
                            : <RunAgentIcon className="h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden="true" />}
                          <div className={`rounded-lg px-3 py-2 text-sm max-w-[80%] ${
                            t.role === 'customer' ? 'bg-blue-50 text-blue-900' : 'bg-slate-100 text-slate-800'
                          }`}>
                            {t.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="card flex flex-col items-center justify-center h-48 text-slate-400 text-sm gap-3">
                <p>Select a run to view details</p>
                <button onClick={() => openNewRun()} className="btn-primary text-sm">+ New Run</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
