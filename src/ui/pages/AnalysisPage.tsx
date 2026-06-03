import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunTelemetrySummary {
  provider: string;
  latencyMs: number | null;
  failureClass: string | null;
}

interface EvalResultSummary {
  overallScore: number;
  passed: boolean;
  summary: string;
}

interface RunSummary {
  id: string;
  scenarioName: string;
  channel: string;
  status: string;
  createdAt: string;
  evalResult: EvalResultSummary | null;
  telemetry: RunTelemetrySummary | null;
}

interface DimensionScore {
  score: number;
  notes?: string;
}

interface EvalResultDetail extends EvalResultSummary {
  dimensionScores: Record<string, DimensionScore>;
  dimensionScoresParseError?: boolean;
  judgeModel: string;
  recommendation?: string | null;
}

interface RunDetail extends RunSummary {
  turns: Array<{ index: number; role: string; content: string }>;
  evalResult: EvalResultDetail | null;
  telemetry: (RunTelemetrySummary & { tokenTotalEstimate: number | null }) | null;
}

interface FailureCluster {
  scenarioName: string;
  failureClass: string;
  count: number;
}

interface FailureSummary {
  window: { hours: number; since: string };
  totalFailures: number;
  clusters: FailureCluster[];
}

interface FilterState {
  status: string;
  channel: string;
  provider: string;
  since: string;
  until: string;
}

const DEFAULT_FILTERS: FilterState = { status: '', channel: '', provider: '', since: '', until: '' };
const PAGE_SIZE = 50;

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-green-700 bg-green-50 border-green-200';
    case 'failed':    return 'text-red-700 bg-red-50 border-red-200';
    case 'running':   return 'text-blue-700 bg-blue-50 border-blue-200';
    default:          return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-700';
  if (score >= 5) return 'text-yellow-700';
  return 'text-red-700';
}

function deltaColor(delta: number): string {
  if (delta > 0.05) return 'text-green-700';
  if (delta < -0.05) return 'text-red-700';
  return 'text-gray-500';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RunRow({
  run,
  selected,
  onToggle,
  selectionFull,
}: {
  run: RunSummary;
  selected: boolean;
  onToggle: (id: string) => void;
  selectionFull: boolean;
}) {
  const score = run.evalResult?.overallScore;
  const passed = run.evalResult?.passed;
  return (
    <tr
      className={`border-b transition-colors ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      onClick={() => onToggle(run.id)}
      style={{ cursor: 'pointer' }}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          disabled={!selected && selectionFull}
          onChange={() => onToggle(run.id)}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-gray-400 whitespace-nowrap">{run.id.slice(-8)}</td>
      <td className="px-3 py-2 max-w-xs truncate text-sm font-medium text-gray-800" title={run.scenarioName}>
        {run.scenarioName}
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${statusColor(run.status)}`}>
          {run.status}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{run.channel}</td>
      <td className="px-3 py-2 text-xs">
        {score !== undefined && score !== null ? (
          <span className={`font-semibold ${scoreColor(score)}`}>{score.toFixed(1)}</span>
        ) : '—'}
      </td>
      <td className="px-3 py-2 text-xs">
        {passed !== undefined && passed !== null ? (
          <span className={passed ? 'text-green-700' : 'text-red-700'}>{passed ? '✓ Pass' : '✗ Fail'}</span>
        ) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-gray-400 whitespace-nowrap">{fmtDate(run.createdAt)}</td>
      <td className="px-3 py-2 text-xs text-gray-400">{run.telemetry?.provider ?? '—'}</td>
    </tr>
  );
}

function ComparePanel({ result }: { result: { runs: RunDetail[] } }) {
  const runs = result.runs;
  const base = runs[0]!;

  // Collect all dimension IDs across all runs
  const dimIds = Array.from(
    new Set(runs.flatMap((r) => Object.keys(r.evalResult?.dimensionScores ?? {})))
  );

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-800 text-sm">Comparison ({runs.length} runs)</h3>

      {/* Summary row */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium">Metric</th>
              {runs.map((r, i) => (
                <th key={r.id} className="px-3 py-2 text-left font-medium">
                  {i === 0 ? '🔵 ' : ''}Run …{r.id.slice(-8)}
                  {i === 0 && <span className="ml-1 text-blue-500 text-[10px]">(base)</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Scenario</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-xs truncate max-w-[180px]" title={r.scenarioName}>{r.scenarioName}</td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Status</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2">
                  <span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${statusColor(r.status)}`}>{r.status}</span>
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Overall Score</td>
              {runs.map((r, i) => {
                const score = r.evalResult?.overallScore ?? null;
                const baseScore = base.evalResult?.overallScore ?? null;
                const delta = i > 0 && score !== null && baseScore !== null ? score - baseScore : null;
                return (
                  <td key={r.id} className="px-3 py-2 text-xs">
                    {score !== null ? (
                      <span className={`font-semibold ${scoreColor(score)}`}>{score.toFixed(2)}</span>
                    ) : '—'}
                    {delta !== null && (
                      <span className={`ml-1.5 text-[11px] ${deltaColor(delta)}`}>
                        ({delta > 0 ? '+' : ''}{delta.toFixed(2)})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Passed</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-xs">
                  {r.evalResult?.passed !== undefined && r.evalResult.passed !== null
                    ? <span className={r.evalResult.passed ? 'text-green-700' : 'text-red-700'}>{r.evalResult.passed ? '✓ Pass' : '✗ Fail'}</span>
                    : '—'}
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Latency (ms)</td>
              {runs.map((r, i) => {
                const lat = r.telemetry?.latencyMs ?? null;
                const baseLat = base.telemetry?.latencyMs ?? null;
                const delta = i > 0 && lat !== null && baseLat !== null ? lat - baseLat : null;
                return (
                  <td key={r.id} className="px-3 py-2 text-xs">
                    {lat !== null ? lat.toLocaleString() : '—'}
                    {delta !== null && (
                      <span className={`ml-1.5 text-[11px] ${deltaColor(-delta / 1000)}`}>
                        ({delta > 0 ? '+' : ''}{delta.toLocaleString()})
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="px-3 py-2 text-xs font-medium text-gray-600">Provider</td>
              {runs.map((r) => (
                <td key={r.id} className="px-3 py-2 text-xs text-gray-500">{r.telemetry?.provider ?? '—'}</td>
              ))}
            </tr>

            {/* Dimension scores */}
            {dimIds.map((dimId) => (
              <tr key={dimId} className="bg-gray-50">
                <td className="px-3 py-2 text-xs font-medium text-gray-500 italic">{dimId}</td>
                {runs.map((r, i) => {
                  const dim = r.evalResult?.dimensionScores?.[dimId];
                  const score = dim?.score ?? null;
                  const baseDim = base.evalResult?.dimensionScores?.[dimId];
                  const baseScore = baseDim?.score ?? null;
                  const delta = i > 0 && score !== null && baseScore !== null ? score - baseScore : null;
                  return (
                    <td key={r.id} className="px-3 py-2 text-xs">
                      {score !== null ? (
                        <span className={scoreColor(score)}>{score.toFixed(1)}</span>
                      ) : '—'}
                      {delta !== null && (
                        <span className={`ml-1 text-[11px] ${deltaColor(delta)}`}>
                          ({delta > 0 ? '+' : ''}{delta.toFixed(1)})
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Transcript comparison */}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Transcripts</h4>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${runs.length}, minmax(0,1fr))` }}>
          {runs.map((r, i) => (
            <div key={r.id} className="border rounded p-2 bg-white max-h-64 overflow-y-auto">
              <div className="text-[10px] font-semibold text-gray-400 mb-1">
                Run …{r.id.slice(-8)}{i === 0 ? ' (base)' : ''}
              </div>
              {r.turns.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No turns</p>
              ) : (
                r.turns.map((t) => (
                  <div key={t.index} className={`mb-1 text-xs rounded px-1.5 py-1 ${t.role === 'customer' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                    <span className="font-semibold mr-1">{t.role === 'customer' ? 'User' : 'Agent'}:</span>
                    {t.content}
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FailureClustersPanel({ summary }: { summary: FailureSummary }) {
  const failureClassColor = (fc: string): string => {
    switch (fc) {
      case 'timeout':    return 'bg-orange-100 text-orange-800';
      case 'auth':       return 'bg-red-100 text-red-800';
      case 'network':    return 'bg-yellow-100 text-yellow-800';
      case 'validation': return 'bg-purple-100 text-purple-800';
      default:           return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800 text-sm">
          Failure Clusters
          <span className="ml-2 text-xs font-normal text-gray-400">last {summary.window.hours}h</span>
        </h3>
        <span className="text-xs text-gray-500">{summary.totalFailures} total failures</span>
      </div>
      {summary.clusters.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No failures in this window 🎉</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-3 py-2 text-left font-medium">Scenario</th>
              <th className="px-3 py-2 text-left font-medium">Failure Class</th>
              <th className="px-3 py-2 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {summary.clusters.map((c, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-700 max-w-xs truncate" title={c.scenarioName}>{c.scenarioName}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${failureClassColor(c.failureClass)}`}>
                    {c.failureClass}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-sm font-semibold text-gray-800">{c.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function AnalysisPage() {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareResult, setCompareResult] = useState<{ runs: RunDetail[] } | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [failureSummary, setFailureSummary] = useState<FailureSummary | null>(null);
  const [failureLoading, setFailureLoading] = useState(false);

  const loadRuns = useCallback(async (f: FilterState, nextOffset: number, append: boolean) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(nextOffset) });
    if (f.status)  params.set('status', f.status);
    if (f.channel) params.set('channel', f.channel);
    if (f.provider) params.set('provider', f.provider);
    if (f.since)   params.set('since', f.since);
    if (f.until)   params.set('until', f.until);
    try {
      const data = await apiFetch(`/api/runs?${params.toString()}`) as { runs: RunSummary[]; total: number };
      setRuns((prev) => append ? [...prev, ...data.runs] : data.runs);
      setTotal(data.total);
      setCurrentOffset(nextOffset);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFailures = useCallback(async () => {
    setFailureLoading(true);
    try {
      const data = await apiFetch('/api/runs/failures/summary?hours=48') as FailureSummary;
      setFailureSummary(data);
    } catch {
      // non-critical — leave null
    } finally {
      setFailureLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRuns(DEFAULT_FILTERS, 0, false);
    void loadFailures();
  }, [loadRuns, loadFailures]);

  function applyFilters(): void {
    setSelectedIds(new Set());
    setCompareResult(null);
    setAppliedFilters(filters);
    void loadRuns(filters, 0, false);
  }

  function resetFilters(): void {
    setFilters(DEFAULT_FILTERS);
    setAppliedFilters(DEFAULT_FILTERS);
    setSelectedIds(new Set());
    setCompareResult(null);
    void loadRuns(DEFAULT_FILTERS, 0, false);
  }

  function loadMore(): void {
    void loadRuns(appliedFilters, currentOffset + PAGE_SIZE, true);
  }

  function toggleSelect(id: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 10) {
        next.add(id);
      }
      return next;
    });
    // Clear previous comparison when selection changes
    setCompareResult(null);
    setCompareError(null);
  }

  async function handleCompare(): Promise<void> {
    if (selectedIds.size < 2) return;
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const ids = Array.from(selectedIds).join(',');
      const data = await apiFetch(`/api/runs/compare?ids=${encodeURIComponent(ids)}`) as { runs: RunDetail[] };
      setCompareResult(data);
    } catch (e) {
      setCompareError((e as Error).message);
    } finally {
      setCompareLoading(false);
    }
  }

  const hasMore = runs.length < total;
  const selectionFull = selectedIds.size >= 10;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Analysis Workspace</h2>
          <p className="text-sm text-gray-500 mt-0.5">Filter, compare, and explore runs side-by-side</p>
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="running">Running</option>
              <option value="pending">Pending</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Channel</label>
            <select
              value={filters.channel}
              onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">All</option>
              <option value="chat">Chat</option>
              <option value="voice">Voice</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Provider</label>
            <input
              type="text"
              placeholder="e.g. connect"
              value={filters.provider}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm text-gray-800 w-28 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Since</label>
            <input
              type="date"
              value={filters.since}
              onChange={(e) => setFilters((f) => ({ ...f, since: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Until</label>
            <input
              type="date"
              value={filters.until}
              onChange={(e) => setFilters((f) => ({ ...f, until: e.target.value }))}
              className="border rounded px-2 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={applyFilters}
              disabled={loading}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Apply Filters
            </button>
            <button
              onClick={resetFilters}
              disabled={loading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content: Run List + Comparison ─────────────────────────────── */}
      <div className={`grid gap-4 ${compareResult ? 'grid-cols-[1fr_1fr]' : 'grid-cols-1'}`}>

        {/* Run list */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">Runs</span>
              <span className="text-xs text-gray-400">({total} total)</span>
              {selectedIds.size > 0 && (
                <span className="text-xs text-blue-600 font-medium">{selectedIds.size} selected</span>
              )}
            </div>
            <button
              onClick={() => { void handleCompare(); }}
              disabled={selectedIds.size < 2 || compareLoading}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {compareLoading ? 'Loading…' : `Compare ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
            </button>
          </div>

          {error && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100">
              Error: {error}
            </div>
          )}

          {compareError && (
            <div className="px-4 py-2 bg-red-50 text-red-700 text-xs border-b border-red-100">
              Compare error: {compareError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">Scenario</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Ch</th>
                  <th className="px-3 py-2 text-left font-medium">Score</th>
                  <th className="px-3 py-2 text-left font-medium">Result</th>
                  <th className="px-3 py-2 text-left font-medium">Created</th>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400 italic">
                      No runs match these filters
                    </td>
                  </tr>
                )}
                {runs.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    selected={selectedIds.has(run.id)}
                    onToggle={toggleSelect}
                    selectionFull={selectionFull}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {(loading) && (
            <div className="px-4 py-3 text-center text-xs text-gray-400">Loading…</div>
          )}

          {hasMore && !loading && (
            <div className="px-4 py-3 border-t border-gray-100 text-center">
              <button
                onClick={loadMore}
                className="text-sm text-blue-600 hover:underline"
              >
                Load more ({total - runs.length} remaining)
              </button>
            </div>
          )}
        </div>

        {/* Comparison panel */}
        {compareResult && (
          <div className="bg-white rounded-lg border border-gray-200 p-4 overflow-auto">
            <div className="flex justify-between items-start mb-3">
              <span className="text-sm font-semibold text-gray-800">Side-by-Side Comparison</span>
              <button
                onClick={() => { setCompareResult(null); setSelectedIds(new Set()); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ✕ Clear
              </button>
            </div>
            <ComparePanel result={compareResult} />
          </div>
        )}
      </div>

      {/* ── Failure Clusters ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        {failureLoading ? (
          <p className="text-sm text-gray-400">Loading failure clusters…</p>
        ) : failureSummary ? (
          <FailureClustersPanel summary={failureSummary} />
        ) : (
          <p className="text-sm text-gray-400">Failure cluster data unavailable</p>
        )}
      </div>
    </div>
  );
}
