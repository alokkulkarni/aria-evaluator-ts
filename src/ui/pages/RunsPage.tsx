import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, toApiUrl } from '../lib/api.js';
import { StatusBadge } from './Dashboard.js';

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
  evalResult?: { overallScore: number; passed: boolean; summary: string; scenarioType?: string } | null;
  report?: { htmlPath: string; jsonPath: string } | null;
  turns?: Array<{ index: number; role: string; content: string }>;
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

/** Providers that are chat-only bots and can never handle voice. */
const CHAT_ONLY_PROVIDERS: ReadonlySet<Provider> = new Set(['lex', 'azure', 'strands', 'copilot', 'openapi', 'websocket']);

function isChatOnlyBot(provider: Provider): boolean {
  return CHAT_ONLY_PROVIDERS.has(provider);
}

/**
 * Returns the channels a provider supports.
 * - lex / azure / strands / copilot are bot providers — chat only.
 * - connect always supports both chat and voice.
 * - custom supports voice only when at least one voice setting is configured.
 */
function supportedChannels(provider: Provider, settings: Record<string, string> = {}): Array<'chat' | 'voice'> {
  if (isChatOnlyBot(provider)) return ['chat'];
  if (provider === 'custom') {
    const hasVoiceConfig = !!(
      settings['CUSTOM_VOICE_PROTOCOL'] ||
      settings['CUSTOM_VOICE_WS_URL'] ||
      settings['DEEPGRAM_VOICE_WS_URL']
    );
    return hasVoiceConfig ? ['chat', 'voice'] : ['chat'];
  }
  // connect
  return ['chat', 'voice'];
}

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
          ⚡ Parallel Execution
        </span>
        <div className="flex items-center gap-2 text-xs">
          {isLive && runningCount > 0 && (
            <span className="flex items-center gap-1 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              {runningCount} running
            </span>
          )}
          <span className="text-green-400">{passedCount} ✓</span>
          {failedCount > 0 && <span className="text-red-400">{failedCount} ✗</span>}
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
          const icon =
            state.status === 'running'  ? '⏳' :
            state.status === 'failed'   ? '✗' :
            state.passed                ? '✅' : '❌';
          const rowColour =
            state.status === 'running'  ? 'text-cyan-300' :
            state.status === 'failed'   ? 'text-red-400' :
            state.passed                ? 'text-green-400' : 'text-red-400';

          return (
            <div key={name} className="flex items-center gap-2 text-xs">
              <span className={`w-4 flex-shrink-0 ${state.status === 'running' ? 'animate-pulse' : ''}`}>
                {icon}
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
          🏁 All {total} scenarios complete · {passedCount} passed · {failedCount} failed
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
                <span className={`text-xs font-bold ml-2 flex-shrink-0 ${block.outcome ? 'text-green-600' : 'text-red-500'}`}>
                  {block.outcome ? '✓' : '✗'} {block.turnCount ?? 0} turns
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
                    <span className="text-base flex-shrink-0">{isAgent ? '🤖' : '👤'}</span>
                    <div className={`rounded-2xl px-3 py-2 text-sm leading-snug max-w-[82%] ${
                      isAgent
                        ? 'bg-slate-100 text-slate-800 rounded-bl-sm'
                        : 'bg-[#0D2A66] text-white rounded-br-sm'
                    }`}>
                      {t.content}
                    </div>
                  </div>
                );
              })}
              {block.outcome === null && isLive && (
                <div className="flex gap-2 items-end">
                  <span className="text-base">🤖</span>
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
          return (
            <div key={i} className={`flex gap-3 ${isAgent ? '' : 'flex-row-reverse'}`}>
              <span className="text-2xl flex-shrink-0 self-end">{isAgent ? '🤖' : '👤'}</span>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                isAgent ? 'bg-slate-100 text-slate-800 rounded-bl-sm' : 'bg-[#0D2A66] text-white rounded-br-sm'
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

interface ReportDimScore { score: number; justification: string; evidence?: string }
interface ReportResult {
  scenarioName: string;
  overallScore: number;
  passed: boolean;
  summary?: string;
  scenarioType?: 'security' | 'quality';
  dimensionScores?: Record<string, ReportDimScore>;
}
interface ReportData {
  generatedAt?: string;
  runId?: string;
  results?: ReportResult[];
}

function ReportView({ url }: { url: string }) {
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
              <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">🛡 Security Test</span>
            )}
          </div>
          {r.summary && <p className="text-xs text-slate-600 mt-0.5">{r.summary}</p>}
        </div>
        <span className={`text-base font-bold flex-shrink-0 ${r.passed ? 'text-green-600' : 'text-red-600'}`}>
          {r.passed ? '✅' : '❌'} {r.overallScore.toFixed(1)}/10
        </span>
      </div>
      {r.dimensionScores && (
        <div className="divide-y divide-slate-100">
          {Object.entries(r.dimensionScores).map(([dim, ds]) => (
            <div key={dim} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 capitalize">{dim.replace(/_/g, ' ')}</p>
                <span className={`text-xs font-bold ${ds.score >= 7 ? 'text-green-600' : ds.score >= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                  {ds.score}/10
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{ds.justification}</p>
              {ds.evidence && (
                <p className="text-[11px] text-slate-400 mt-1 italic border-l-2 border-slate-200 pl-2">{ds.evidence}</p>
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
            color: 'text-[#0D2A66]',
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
          🛡 <strong>{securityResults.length} security test{securityResults.length > 1 ? 's' : ''}</strong> are shown separately below and excluded from the quality score.
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
          <p className="text-xs font-semibold text-purple-600 uppercase tracking-wide">🛡 Security / Adversarial Tests</p>
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
      <div className="bg-white rounded-xl shadow-2xl flex flex-col w-full max-w-3xl h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <p className="text-sm font-semibold text-slate-800 truncate max-w-[75%]" title={label}>{label}</p>
          <div className="flex items-center gap-3">
            <a href={url} target="_blank" rel="noreferrer" className="text-xs text-slate-500 hover:text-slate-700 underline shrink-0">
              Open in new tab ↗
            </a>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none font-bold">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden rounded-b-xl">
          {type === 'transcript' && <TranscriptChatView url={url} />}
          {type === 'report' && <ReportView url={url} />}
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
}: {
  onClose: () => void;
  onStarted: (runId: string) => void;
}) {
  const [options, setOptions] = useState<ScenarioOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedScenarioRefs, setSelectedScenarioRefs] = useState<string[]>([]);
  const [channel, setChannel] = useState<'chat' | 'voice'>('chat');
  const [provider, setProvider] = useState<Provider>('connect');
  const [providerSettings, setProviderSettings] = useState<Record<string, string>>({});
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
        setProviderSettings(settingsMap);
        const defaultProvider = (settingsMap['EVAL_PROVIDER_DEFAULT'] ?? 'connect').toLowerCase();
        if (ALL_PROVIDERS.has(defaultProvider)) {
          setProvider(defaultProvider);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!supportedChannels(provider, providerSettings).includes(channel)) {
      setChannel('chat');
    }
  }, [provider, channel, providerSettings]);

  const filtered = options.filter((o) =>
    (o.channel === channel || (channel === 'voice' && o.channel === 'chat'))
    && (
      o.filePath.toLowerCase().includes(search.toLowerCase())
      || o.name.toLowerCase().includes(search.toLowerCase())
      || (o.goal ?? '').toLowerCase().includes(search.toLowerCase())
    ),
  );

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
        body: JSON.stringify({ scenarioRefs: selectedScenarioRefs, channel, provider }),
      }) as { runId: string };
      onStarted(data.runId);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-900">New Evaluation Run</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>

        <div className="px-6 pt-4 pb-2">
          <input
            autoFocus
            type="text"
            placeholder="Search scenarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D2A66]"
          />
          <p className="text-xs text-slate-500 mt-2">
            Select one or more scenarios. Voice runs selected scenarios in a single WebRTC session.
          </p>
        </div>

        <div className="px-6 overflow-y-auto flex-1 py-2 space-y-2">
          {filtered.length === 0 ? (
            <p className="text-slate-400 text-sm py-4 text-center">No scenarios match.</p>
          ) : (() => {
            // Build two-level grouping: category → subCategory → ScenarioOptions
            const grouped = new Map<string, Map<string, ScenarioOption[]>>();
            for (const o of filtered) {
              const raw = (o.filePath ?? '').replace(/\\/g, '/');
              const parts = raw.split('/').filter(Boolean);
              const cat = parts.length >= 2 ? (parts[0] ?? 'general') : 'general';
              const sub = (parts.length >= 2 ? parts[1] : parts[0] ?? 'other')!.replace(/\.(ya?ml)$/i, '');
              if (!grouped.has(cat)) grouped.set(cat, new Map());
              const subMap = grouped.get(cat)!;
              if (!subMap.has(sub)) subMap.set(sub, []);
              subMap.get(sub)!.push(o);
            }
            const catMeta: Record<string, { icon: string; hdr: string }> = {
              adversarial: { icon: '⚔️', hdr: 'bg-red-50 text-red-800 border-red-200' },
              banking:     { icon: '🏦', hdr: 'bg-blue-50 text-blue-800 border-blue-200' },
              edge_cases:  { icon: '🔬', hdr: 'bg-purple-50 text-purple-800 border-purple-200' },
              escalation:  { icon: '📈', hdr: 'bg-amber-50 text-amber-800 border-amber-200' },
              general:     { icon: '📋', hdr: 'bg-slate-50 text-slate-700 border-slate-200' },
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
                        <span>{meta.icon}</span>
                        <span>{modalFmt(cat)}</span>
                        <span className="text-xs font-normal opacity-70">
                          {selectedCount > 0 ? `${selectedCount}/` : ''}{allRefs.length}
                        </span>
                      </span>
                      <span className="text-xs">{collapsed ? '▶' : '▼'}</span>
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
                                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                                    o.channel === 'voice' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                                  }`}>
                                    {o.channel === 'voice' ? '🎤' : '💬'} {o.channel}
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
                  title={isChatOnlyBot(p) ? 'Chat only — this bot provider does not support voice' : undefined}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                    provider === p
                      ? 'bg-[#0D2A66] text-white border-[#0D2A66]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p}
                  {isChatOnlyBot(p) && (
                    <span
                      className={`text-[10px] leading-none ${provider === p ? 'text-blue-200' : 'text-slate-400'}`}
                      aria-label="chat only"
                    >
                      💬
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 font-medium">Channel:</span>
              {(supportedChannels(provider, providerSettings)).map((c) => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    channel === c
                      ? 'bg-[#0D2A66] text-white border-[#0D2A66]'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c === 'chat' ? '💬 Chat' : '🎤 Voice'}
                </button>
              ))}
              {isChatOnlyBot(provider) && (
                <span className="text-xs text-slate-400 italic">
                  Voice is not available for bot providers (lex, azure, strands, copilot, openapi, websocket)
                </span>
              )}
              {provider === 'custom' && !supportedChannels('custom', providerSettings).includes('voice') && (
                <span className="text-xs text-slate-400 italic">
                  Configure a voice protocol in Settings to enable voice
                </span>
              )}
            </div>
            <span className="text-xs text-slate-500">{selectedScenarioRefs.length} scenario(s) selected</span>
          </div>

          {error && <p className="text-xs text-red-600">⚠ {error}</p>}

          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary flex-1 text-sm">Cancel</button>
            <button
              disabled={selectedScenarioRefs.length === 0 || running}
              onClick={startRun}
              className="btn-primary flex-1 text-sm disabled:opacity-40"
            >
              {running ? '⏳ Starting…' : '▶ Start Run'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RunsPage({ autoOpenModal, onModalAutoOpened }: { autoOpenModal?: boolean; onModalAutoOpened?: () => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
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
    setShowModal(true);
  }

  function handleRunStarted(runId: string): void {
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
        setLiveEvents((prev) => [...prev, d.message ?? '🕒 Run queued']);
      });
      es.addEventListener('start', (e) => {
        const d = JSON.parse(e.data) as {
          message?: string;
          provider?: string;
          channel?: string;
          scenarioCount?: number;
        };
        const fallback = `▶ Run started (${d.provider ?? 'unknown'} · ${d.channel ?? 'chat'} · ${d.scenarioCount ?? 0} scenario(s))`;
        setLiveEvents((prev) => [...prev, d.message ?? fallback]);
      });
      es.addEventListener('log', (e) => {
        const d = JSON.parse(e.data);
        setLiveEvents((prev) => [...prev, d.message]);
      });
      es.addEventListener('complete', async (e) => {
        const d = JSON.parse(e.data);
        setLiveEvents((prev) => [...prev, d.summary ? `✅ ${d.summary}` : '✅ Run completed']);
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
        setLiveEvents((prev) => [...prev, `❌ Failed: ${d.error}`]);
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
          onClose={() => setShowModal(false)}
          onStarted={handleRunStarted}
        />
      )}

      {artifactModal && (
        <ArtifactPreviewModal
          url={artifactModal.url}
          label={artifactModal.label}
          type={artifactModal.type}
          onClose={() => setArtifactModal(null)}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Evaluation Runs</h2>
            <p className="text-slate-500 mt-1">{runs.length} visible run(s)</p>
          </div>
          <button onClick={() => openNewRun()} className="btn-primary">
            + New Run
          </button>
        </div>

        <div className="grid md:grid-cols-5 gap-4">
          <div className="md:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
            {loading ? (
              <div className="text-slate-400 text-sm">Loading…</div>
            ) : runs.length === 0 ? (
              <div className="card text-center space-y-3 py-8">
                <p className="text-slate-400 text-sm">No runs yet.</p>
                <button onClick={() => openNewRun()} className="btn-primary text-sm">+ New Run</button>
              </div>
            ) : (
              runs.map((r) => (
                <div
                  key={r.id}
                  onClick={() => { void selectRun(r); }}
                  className={`card cursor-pointer transition-all text-sm ${
                    selected?.id === r.id ? 'ring-2 ring-[#0D2A66]' : 'hover:shadow-md'
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
                        <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">🛡</span>
                      )}
                      {r.evalResult && (
                        <span className={r.evalResult.passed ? 'text-green-700 font-bold text-xs' : 'text-red-600 font-bold text-xs'}>
                          {r.evalResult.overallScore.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); void deleteRun(r.id); }}
                      className="text-xs text-red-600 hover:underline font-medium"
                      title="Delete run"
                    >
                      🗑 Delete
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
                    <button onClick={() => openNewRun()} className="btn-primary text-xs py-1 px-3">
                      ↩ Re-run
                    </button>
                    <button
                      onClick={() => { void deleteRun(selected.id); }}
                      className="btn-secondary text-xs py-1 px-3"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>

                {selected.evalResult && (
                  <div className="bg-slate-50 rounded-lg p-4">
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-700">
                          {selected.evalResult.passed ? '✅ PASS' : '❌ FAIL'} — {selected.evalResult.overallScore.toFixed(1)}/10
                        </p>
                        {selected.evalResult.scenarioType === 'security' && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">🛡 Security Test</span>
                        )}
                        {selected.evalResult.scenarioType === 'mixed' && (
                          <span className="text-xs bg-purple-100 text-purple-700 rounded px-1.5 py-0.5 font-semibold">🛡 Contains Security Tests</span>
                        )}
                      </div>
                      <button
                        onClick={() => { void queueForReview(selected.id); }}
                        disabled={queueingRunId === selected.id}
                        className="text-xs px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-40"
                        title="Add to judge calibration review queue"
                      >
                        {queueingRunId === selected.id ? '⏳ Queuing…' : '🔍 Queue for Review'}
                      </button>
                    </div>
                    {queueMessage?.runId === selected.id && (
                      <p className={`text-xs mt-1 ${queueMessage.ok ? 'text-green-600' : 'text-red-500'}`}>
                        {queueMessage.text}
                      </p>
                    )}
                    <p className="text-sm text-slate-600">{selected.evalResult.summary}</p>
                  </div>
                )}

                {selected.errorMessage && (
                  <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">
                    ⚠ {selected.errorMessage}
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
                              🧾 {t.name}
                            </button>
                            <button
                              className={btnClass}
                              title={`Transcript conversation — ${t.name}`}
                              onClick={() => setArtifactModal({ url: t.rawUrl, label: `Transcript: ${t.name}`, type: 'transcript' })}
                            >
                              💬 Transcript HTML
                            </button>
                          </React.Fragment>
                        ))}
                        {reportHtmlUrl && (
                          <button
                            className={btnClass}
                            title={reportHtmlPath ?? undefined}
                            onClick={() => setArtifactModal({ url: reportHtmlUrl, label: 'HTML Report', type: 'html' })}
                          >
                            📊 HTML report
                          </button>
                        )}
                        {reportJsonUrl && (
                          <button
                            className={btnClass}
                            title={reportJsonPath ?? undefined}
                            onClick={() => setArtifactModal({ url: reportJsonUrl, label: 'JSON Report', type: 'report' })}
                          >
                            🧠 JSON report
                          </button>
                        )}
                        {audioUrl && (
                          <a
                            href={audioUrl}
                            download={selected.audioPath ?? undefined}
                            className={`${btnClass} inline-flex items-center`}
                            title={selected.audioPath ?? 'Voice recording WAV'}
                          >
                            🎙 Voice recording
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {selected.audioPath && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-2">🎙 Voice Recording</p>
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
                          <span className="text-lg flex-shrink-0">{t.role === 'customer' ? '👤' : '🤖'}</span>
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
