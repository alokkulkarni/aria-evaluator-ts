// src/ui/pages/BaselinesPage.tsx
// Baselines & Drift — UI over the existing regression/baseline API
// (src/api/routes/regression.ts). List/create/delete baselines and view the
// regression status (severity, deltas, judge drift) for a baseline's scenario.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ApiError, apiFetch } from '../lib/api.js';

/** Prefer the server's own error message (verbatim) over the "status text" wrapper. */
function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.error) return e.error;
  return (e as Error).message;
}

// ── API response types (mirroring src/api/routes/regression.ts) ──────────────

interface BaselineRow {
  id: string;
  name: string;
  scenarioId: string;
  totalRuns: number;
  passRate: number;       // 0–1 fraction
  avgScore: number;       // 0–10
  avgLatencyMs: number;
  judgeModel: string;
  judgeVersion: number;
  judgeConfigHash: string | null;
  createdAt: string;
  createdBy: string | null;
  notes: string | null;
  user?: { username: string } | null;
}

// GET /api/scenarios returns YAML-shaped docs. The DB row id is not included
// today (typed optional so we use it when present); the reliable cuid source
// for the picker is the runs list below.
interface ScenarioDoc {
  id?: string;
  scenario_id?: string;
  name: string;
}

interface RunRow {
  id: string;
  scenarioId: string | null;
  scenarioName: string;
  evalResult?: { judgeModel?: string | null } | null;
}

interface DimensionDelta {
  old: number;
  new: number;
  delta: number;
  severity: string; // 'none' | 'medium'
}

type Severity = 'NONE' | 'LOW' | 'MEDIUM' | 'CRITICAL';

interface RegressionReport {
  severity: Severity;
  passRateDelta: number;        // fraction
  passRateDeltaPercent: number; // percentage points
  avgScoreDelta: number;        // 0–10 points
  latencyDeltaMs: number;
  dimensionDeltas: Record<string, DimensionDelta>;
  newDimensions: string[];
  deprecatedDimensions: string[];
  recentRunCount: number;
  comparableRunCount: number;
}

interface JudgeDriftReport {
  detected: boolean;
  baselineHash: string | null;
  mismatchedHashes: string[];
}

interface DriftInsights {
  detected: boolean;
  severity: Severity;
  summary: string;
  passRateDeltaPercent: number;
  avgScoreDelta: number;
  dimensions: {
    dimensionId: string;
    label: string;
    oldScore: number;
    newScore: number;
    delta: number;
    severity: string;
    reason: string;
    suggestion: string;
  }[];
  suggestions: string[];
  judgeConfigChanged: boolean;
  caveats: string[];
}

interface RegressionStatus {
  message?: string; // "No recent runs found" variant
  baseline?: {
    id: string;
    name: string;
    createdAt: string;
    totalRuns: number;
    passRate: number;
    avgScore: number;
    avgLatencyMs: number;
    judgeConfigHash: string | null;
  };
  regression: RegressionReport | null;
  judgeDrift?: JudgeDriftReport;
  driftInsights?: DriftInsights;
  recentRunCount: number;
  dateRange?: { from?: string | null; to?: string | null };
}

// ── Formatting helpers ────────────────────────────────────────────────────────

function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

function score(value: number): string {
  return `${value.toFixed(1)}/10`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

function dimLabel(dimId: string): string {
  return dimId.replace(/_/g, ' ');
}

function severityBadge(severity: Severity): string {
  switch (severity) {
    case 'NONE': return 'bg-green-50 text-green-700 ring-1 ring-green-200';
    case 'LOW': return 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200';
    case 'MEDIUM': return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    case 'CRITICAL': return 'bg-red-50 text-red-700 ring-1 ring-red-200';
    default: return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
  }
}

/** Signed delta with an arrow; positive = improvement (green), negative = regression (red). */
function Delta({ value, digits = 1, unit = '' }: { value: number; digits?: number; unit?: string }) {
  const eps = 0.05;
  const cls = value > eps ? 'text-green-600' : value < -eps ? 'text-red-600' : 'text-slate-500';
  const arrow = value > eps ? '▲' : value < -eps ? '▼' : '→';
  return (
    <span className={`font-mono font-semibold ${cls}`}>
      {arrow} {value >= 0 ? '+' : ''}{value.toFixed(digits)}{unit}
    </span>
  );
}

// ── Regression status panel ───────────────────────────────────────────────────

function StatusPanel({
  status,
  baselineRow,
  scenarioName,
  loading,
  error,
}: {
  status: RegressionStatus | null;
  baselineRow: BaselineRow | null;
  scenarioName: string | null;
  loading: boolean;
  error: string | null;
}) {
  if (!baselineRow && !loading && !error) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">Regression status</h2>
      {baselineRow && (
        <p className="mb-3 text-xs text-slate-500">
          Recent runs of <span className="font-semibold text-slate-600">{scenarioName ?? baselineRow.scenarioId}</span> (judge{' '}
          <span className="font-mono">{baselineRow.judgeModel}</span>) compared against the latest baseline for that scenario + judge.
        </p>
      )}

      {loading && <p className="text-sm text-slate-400">Checking regression status…</p>}
      {error && !loading && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>
      )}

      {!loading && !error && status && status.regression === null && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200">
          {status.message ?? 'No recent runs found'} — run this scenario again after the baseline date to compare against it.
        </p>
      )}

      {!loading && !error && status && status.regression && (
        <div className="space-y-4">
          {/* Header: severity + window */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded px-2.5 py-1 text-xs font-bold ${severityBadge(status.regression.severity)}`}>
              {status.regression.severity}
            </span>
            <span className="text-xs text-slate-500">
              {status.baseline ? <>Baseline “{status.baseline.name}” ({formatDate(status.baseline.createdAt)}, {status.baseline.totalRuns} runs)</> : null}
              {' · '}{status.recentRunCount} recent run{status.recentRunCount === 1 ? '' : 's'}
              {status.dateRange?.from && status.dateRange?.to
                ? ` (${formatDate(status.dateRange.from)} – ${formatDate(status.dateRange.to)})`
                : ''}
            </span>
          </div>

          {/* Judge drift banner */}
          {status.judgeDrift?.detected && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
              <p className="font-semibold">Judge drift detected</p>
              <p className="mt-1">
                Judge configuration changed since this baseline was recorded — scores may not be comparable.
                Re-create the baseline after intentional judge changes.
              </p>
              {status.judgeDrift.mismatchedHashes.length > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  {status.judgeDrift.mismatchedHashes.length} judge config
                  {status.judgeDrift.mismatchedHashes.length === 1 ? '' : 's'} differ from the baseline
                  {status.judgeDrift.baselineHash ? <> (baseline <span className="font-mono">{status.judgeDrift.baselineHash.slice(0, 12)}…</span>)</> : null}.
                </p>
              )}
            </div>
          )}

          {/* Headline deltas */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-xs uppercase text-slate-400">Pass rate</p>
              <p className="mt-1 text-sm text-slate-700">
                {status.baseline ? pct(status.baseline.passRate) : '—'}
                <span className="mx-1 text-slate-400">→</span>
                {status.baseline ? pct(status.baseline.passRate + status.regression.passRateDelta) : '—'}
              </p>
              <p className="mt-1 text-sm"><Delta value={status.regression.passRateDeltaPercent} unit=" pts" /></p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-xs uppercase text-slate-400">Avg score</p>
              <p className="mt-1 text-sm text-slate-700">
                {status.baseline ? score(status.baseline.avgScore) : '—'}
                <span className="mx-1 text-slate-400">→</span>
                {status.baseline ? score(status.baseline.avgScore + status.regression.avgScoreDelta) : '—'}
              </p>
              <p className="mt-1 text-sm"><Delta value={status.regression.avgScoreDelta} unit=" pts" /></p>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
              <p className="text-xs uppercase text-slate-400">Avg latency</p>
              <p className="mt-1 text-sm text-slate-700">
                {status.baseline ? `${status.baseline.avgLatencyMs} ms` : '—'}
                <span className="mx-1 text-slate-400">→</span>
                {status.baseline ? `${status.baseline.avgLatencyMs + status.regression.latencyDeltaMs} ms` : '—'}
              </p>
              {/* For latency an increase is a regression, so flip the sign for coloring. */}
              <p className="mt-1 text-sm"><Delta value={-status.regression.latencyDeltaMs} digits={0} unit=" ms" /></p>
            </div>
          </div>

          {/* Drift insights */}
          {status.driftInsights && (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">{status.driftInsights.summary}</p>
              {status.driftInsights.caveats.length > 0 && (
                <ul className="space-y-1">
                  {status.driftInsights.caveats.map((c) => (
                    <li key={c} className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">{c}</li>
                  ))}
                </ul>
              )}
              {status.driftInsights.suggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-400">Suggested actions</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-600">
                    {status.driftInsights.suggestions.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Per-dimension deltas */}
          {Object.keys(status.regression.dimensionDeltas).length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Per-dimension drift</p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                    <th className="px-2 py-2">Dimension</th>
                    <th className="px-2 py-2">Baseline</th>
                    <th className="px-2 py-2">Recent</th>
                    <th className="px-2 py-2">Delta</th>
                    <th className="px-2 py-2">Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(status.regression.dimensionDeltas).map(([dimId, d]) => (
                    <tr key={dimId} className="border-b border-slate-50">
                      <td className="px-2 py-2 font-medium capitalize text-slate-700">{dimLabel(dimId)}</td>
                      <td className="px-2 py-2 font-mono text-slate-600">{d.old.toFixed(1)}</td>
                      <td className="px-2 py-2 font-mono text-slate-600">{d.new.toFixed(1)}</td>
                      <td className="px-2 py-2"><Delta value={d.delta} /></td>
                      <td className="px-2 py-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            d.severity === 'none'
                              ? 'bg-green-50 text-green-700 ring-1 ring-green-200'
                              : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                          }`}
                        >
                          {d.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(status.regression.newDimensions.length > 0 || status.regression.deprecatedDimensions.length > 0) && (
            <p className="text-xs text-slate-500">
              {status.regression.newDimensions.length > 0 && (
                <>New dimensions since baseline: <span className="capitalize">{status.regression.newDimensions.map(dimLabel).join(', ')}</span>. </>
              )}
              {status.regression.deprecatedDimensions.length > 0 && (
                <>No longer scored: <span className="capitalize">{status.regression.deprecatedDimensions.map(dimLabel).join(', ')}</span>.</>
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function BaselinesPage({ isAdmin = false }: { isAdmin?: boolean }) {
  const [baselines, setBaselines] = useState<BaselineRow[]>([]);
  const [scenarioOptions, setScenarioOptions] = useState<{ id: string; name: string }[]>([]);
  const [judgeModels, setJudgeModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Create form
  const [formScenarioId, setFormScenarioId] = useState('');
  const [formName, setFormName] = useState('');
  const [formJudgeModel, setFormJudgeModel] = useState('');
  const [formJudgeVersion, setFormJudgeVersion] = useState('1');
  const [formNotes, setFormNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const judgeModelPrefilled = useRef(false);

  // Regression status
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<RegressionStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [baselineRows, scenariosRes, runsRes] = await Promise.all([
        apiFetch('/api/baselines') as Promise<BaselineRow[]>,
        apiFetch('/api/scenarios') as Promise<{ scenarios: ScenarioDoc[] }>,
        apiFetch('/api/runs?limit=500') as Promise<{ runs: RunRow[] }>,
      ]);

      setBaselines(Array.isArray(baselineRows) ? baselineRows : []);

      // Baselines key on the DB scenario id (cuid). The runs list is the
      // reliable source of (id, name) pairs — and only scenarios with runs can
      // be baselined anyway. Scenario docs that carry an id are merged in too.
      const byId = new Map<string, string>();
      for (const run of runsRes.runs ?? []) {
        if (run.scenarioId && !byId.has(run.scenarioId)) byId.set(run.scenarioId, run.scenarioName);
      }
      for (const doc of scenariosRes.scenarios ?? []) {
        if (doc.id && !byId.has(doc.id)) byId.set(doc.id, doc.name);
      }
      setScenarioOptions(
        [...byId.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      // Known judge models for the datalist (baselines first, then run evals).
      const models = new Set<string>();
      for (const b of Array.isArray(baselineRows) ? baselineRows : []) models.add(b.judgeModel);
      for (const run of runsRes.runs ?? []) {
        if (run.evalResult?.judgeModel) models.add(run.evalResult.judgeModel);
      }
      setJudgeModels([...models].sort());

      // Prefill the form's judge model / version from the latest baseline once.
      if (!judgeModelPrefilled.current && Array.isArray(baselineRows) && baselineRows.length > 0) {
        judgeModelPrefilled.current = true;
        const latest = baselineRows[0];
        if (latest) {
          setFormJudgeModel((prev) => prev || latest.judgeModel);
          setFormJudgeVersion(String(latest.judgeVersion));
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scenarioNameById = useMemo(
    () => new Map(scenarioOptions.map((s) => [s.id, s.name])),
    [scenarioOptions],
  );

  async function createBaseline(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setNote(null);
    try {
      const created = await apiFetch('/api/baselines', {
        method: 'POST',
        body: JSON.stringify({
          scenarioId: formScenarioId,
          name: formName.trim(),
          judgeModel: formJudgeModel.trim(),
          judgeVersion: Number(formJudgeVersion),
          ...(formNotes.trim() ? { notes: formNotes.trim() } : {}),
        }),
      }) as BaselineRow;
      setNote(`Baseline “${created.name}” created from ${created.totalRuns} runs.`);
      setFormName('');
      setFormNotes('');
      await load();
    } catch (e) {
      // Surface the server message verbatim (e.g. "Insufficient runs to create baseline: 3 < 10 required").
      setCreateError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  async function deleteBaseline(b: BaselineRow) {
    if (!window.confirm(`Delete baseline “${b.name}”? This cannot be undone.`)) return;
    setError(null);
    setNote(null);
    try {
      await apiFetch(`/api/baselines/${encodeURIComponent(b.id)}`, { method: 'DELETE' });
      if (selectedId === b.id) {
        setSelectedId(null);
        setStatus(null);
        setStatusError(null);
      }
      setNote(`Baseline “${b.name}” deleted.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const checkStatus = useCallback(async (b: BaselineRow) => {
    setSelectedId(b.id);
    setStatus(null);
    setStatusError(null);
    setStatusLoading(true);
    try {
      const res = await apiFetch(
        `/api/regression/status?scenarioId=${encodeURIComponent(b.scenarioId)}&judgeModel=${encodeURIComponent(b.judgeModel)}`,
      ) as RegressionStatus;
      setStatus(res);
    } catch (e) {
      setStatusError(errorMessage(e));
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const selectedBaseline = baselines.find((b) => b.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Baselines &amp; Drift</h1>
          <p className="text-sm text-slate-500">
            Snapshot a scenario&apos;s pass rate and scores as a baseline, then compare later runs against it to
            catch regressions and judge drift. Baselines need at least 10 evaluated runs.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {note && <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 ring-1 ring-green-200">{note}</p>}

      {/* Baseline list */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Baselines</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading baselines…</p>
        ) : baselines.length === 0 ? (
          <p className="text-sm text-slate-400">
            No baselines yet.{' '}
            {isAdmin
              ? 'Create one below once a scenario has at least 10 evaluated runs for a judge model.'
              : 'An admin can create one once a scenario has at least 10 evaluated runs.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                  <th className="px-2 py-2">Name</th>
                  <th className="px-2 py-2">Scenario</th>
                  <th className="px-2 py-2">Judge model</th>
                  <th className="px-2 py-2">Pass rate</th>
                  <th className="px-2 py-2">Avg score</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2">Notes</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {baselines.map((b) => (
                  <tr
                    key={b.id}
                    className={`border-b border-slate-50 ${selectedId === b.id ? 'bg-cyan-50/50' : ''}`}
                  >
                    <td className="px-2 py-2 font-medium text-slate-700">{b.name}</td>
                    <td className="px-2 py-2 text-slate-600" title={b.scenarioId}>
                      {scenarioNameById.get(b.scenarioId) ?? `${b.scenarioId.slice(0, 10)}…`}
                    </td>
                    <td className="px-2 py-2 font-mono text-xs text-slate-500">{b.judgeModel}</td>
                    <td className="px-2 py-2 font-mono text-slate-600">{pct(b.passRate)}</td>
                    <td className="px-2 py-2 font-mono text-slate-600">{score(b.avgScore)}</td>
                    <td className="px-2 py-2 text-slate-500" title={formatDate(b.createdAt)}>
                      {new Date(b.createdAt).toLocaleDateString()}
                    </td>
                    <td className="max-w-[16rem] truncate px-2 py-2 text-slate-500" title={b.notes ?? ''}>
                      {b.notes ?? '—'}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void checkStatus(b)}
                          className="rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600"
                        >
                          Check status
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => void deleteBaseline(b)}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Regression status panel */}
      <StatusPanel
        status={status}
        baselineRow={selectedBaseline}
        scenarioName={selectedBaseline ? (scenarioNameById.get(selectedBaseline.scenarioId) ?? null) : null}
        loading={statusLoading}
        error={statusError}
      />

      {/* Create baseline */}
      {isAdmin && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Create baseline</h2>
          <p className="mb-3 text-xs text-slate-500">
            Snapshots the current pass rate, average score, and per-dimension metrics for a scenario + judge model.
            The API requires at least 10 evaluated runs for that combination.
          </p>
          {createError && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{createError}</p>
          )}
          <form onSubmit={(e) => void createBaseline(e)} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Scenario
              <select
                value={formScenarioId}
                onChange={(e) => setFormScenarioId(e.target.value)}
                required
                className="w-64 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              >
                <option value="">Select a scenario…</option>
                {scenarioOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Name
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                placeholder="e.g. pre-release v2.4"
                className="w-56 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Judge model
              <input
                value={formJudgeModel}
                onChange={(e) => setFormJudgeModel(e.target.value)}
                required
                list="baseline-judge-models"
                placeholder="e.g. anthropic.claude-3-5-sonnet…"
                className="w-72 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <datalist id="baseline-judge-models">
                {judgeModels.map((m) => <option key={m} value={m} />)}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Judge version
              <input
                type="number"
                min="0"
                step="1"
                value={formJudgeVersion}
                onChange={(e) => setFormJudgeVersion(e.target.value)}
                required
                className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">
              Notes (optional)
              <input
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                placeholder="Why this baseline exists"
                className="w-72 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={creating || scenarioOptions.length === 0}
              className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create baseline'}
            </button>
          </form>
          {scenarioOptions.length === 0 && !loading && (
            <p className="mt-3 text-xs text-slate-400">
              No scenarios with recorded runs yet — run some evaluations first, then create a baseline.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
