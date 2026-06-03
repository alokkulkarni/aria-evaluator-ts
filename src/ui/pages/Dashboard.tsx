// src/ui/pages/Dashboard.tsx
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { formatLatency, formatTokenCount } from '../lib/format.js';

interface Run {
  id: string;
  scenarioName: string;
  channel: string;
  status: string;
  createdAt: string;
  evalResult?: {
    overallScore: number;
    passed: boolean;
    scenarioType?: string;
    judgeTokenTotalEstimate?: number | null;
  } | null;
  telemetry?: {
    provider?: string;
    tokenTotalEstimate?: number | null;
  } | null;
}

interface ObservabilityMetrics {
  totals: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    failureRatePercent: number | null;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    tokenTotalEstimate: number;
    avgTokensPerRunEstimate: number | null;
    scenarioTokenTotalEstimate: number;
    judgeTokenTotalEstimate: number;
    avgScenarioTokensPerRunEstimate: number | null;
    avgJudgeTokensPerRunEstimate: number | null;
  };
  providers: Array<{
    provider: string;
    runCount: number;
    failedRuns: number;
    avgLatencyMs: number | null;
  }>;
  failures: Array<{
    failureClass: string;
    count: number;
  }>;
}

interface Props {
  onNavigate: (page: 'scenarios' | 'runs' | 'transcripts' | 'reports') => void;
  onNewRun?: () => void;
}

export function Dashboard({ onNavigate, onNewRun }: Props) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ObservabilityMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/runs')
      .then((d: { runs: Run[] }) => setRuns(d.runs ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiFetch('/api/metrics?hours=24')
      .then((d: ObservabilityMetrics) => setMetrics(d))
      .catch(() => {})
      .finally(() => setMetricsLoading(false));
  }, []);

  const total = runs.length;
  const passed = runs.filter((r) => r.evalResult?.passed === true).length;
  const failed = runs.filter((r) => r.evalResult?.passed === false).length;

  // Exclude security-only runs from the quality average so adversarial tests
  // don't drag down the headline score.
  const qualityRuns = runs.filter((r) => r.evalResult && r.evalResult.scenarioType !== 'security');
  const avgScore =
    qualityRuns.length > 0
      ? (qualityRuns.reduce((a, b) => a + (b.evalResult?.overallScore ?? 0), 0) / qualityRuns.length).toFixed(1)
      : '—';

  const recent = runs.slice(0, 8);

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div data-tour-target="dashboard-hero" className="max-w-3xl space-y-3">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Enterprise evaluation hub</p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Dashboard</h2>
          <p className="text-sm leading-6 text-slate-200/80">Agent quality evaluation overview</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-xs text-slate-100/90">
          <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10">Total runs {total}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10">Passed {passed}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10">Failed {failed}</span>
          <span className="rounded-full bg-white/10 px-3 py-1 ring-1 ring-white/10">Live observability</span>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-tour-target="dashboard-summary">
        <StatCard label="Avg Score" value={String(avgScore)} sub="/10" color="blue" />
        <StatCard label="Total Runs" value={String(total)} color="slate" />
        <StatCard label="Passed" value={String(passed)} color="green" />
        <StatCard label="Failed" value={String(failed)} color="red" />
      </div>

      <div className="card" data-tour-target="dashboard-observability">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Observability (last 24h)</h3>
        </div>

        {metricsLoading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading telemetry…</div>
        ) : !metrics ? (
          <div className="py-8 text-center text-sm text-slate-400">Telemetry unavailable.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Failure rate</p>
                <p className="text-lg font-semibold text-slate-900">
                  {metrics.totals.failureRatePercent?.toFixed(1) ?? '—'}%
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Avg latency</p>
                <p className="text-lg font-semibold text-slate-900">
                  {metrics.totals.avgLatencyMs != null ? formatLatency(metrics.totals.avgLatencyMs) : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">P95 latency</p>
                <p className="text-lg font-semibold text-slate-900">
                  {metrics.totals.p95LatencyMs != null ? formatLatency(metrics.totals.p95LatencyMs) : '—'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white/80 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Judge tokens</p>
                <p className="text-lg font-semibold text-slate-900">
                  {metrics.totals.judgeTokenTotalEstimate > 0 ? formatTokenCount(metrics.totals.judgeTokenTotalEstimate) : '—'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Scenario turns: {metrics.totals.scenarioTokenTotalEstimate > 0
                    ? formatTokenCount(metrics.totals.scenarioTokenTotalEstimate)
                    : '—'}
                </p>
                {metrics.totals.judgeTokenTotalEstimate === 0 && metrics.totals.scenarioTokenTotalEstimate > 0 && (
                  <p className="mt-1 text-[10px] text-amber-600">Judge usage appears on new runs.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Provider breakdown</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="pb-2 font-medium">Provider</th>
                      <th className="pb-2 font-medium">Runs</th>
                      <th className="pb-2 font-medium">Failed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.providers.slice(0, 5).map((provider) => (
                      <tr key={provider.provider} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 font-medium text-slate-800">{provider.provider}</td>
                        <td className="py-2.5">{provider.runCount}</td>
                        <td className="py-2.5">{provider.failedRuns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Failure classes</h4>
                {metrics.failures.length === 0 ? (
                  <div className="py-4 text-sm text-slate-400">No failures in this window.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="pb-2 font-medium">Class</th>
                        <th className="pb-2 font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.failures.slice(0, 5).map((failure) => (
                        <tr key={failure.failureClass} className="border-b border-slate-50 last:border-0">
                          <td className="py-2.5 font-medium text-slate-800">{failure.failureClass}</td>
                          <td className="py-2.5">{failure.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" data-tour-target="dashboard-recent-runs">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Recent Runs</h3>
          <button onClick={() => onNavigate('runs')} className="text-sm font-medium text-blue-700 hover:underline">
            View all →
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No runs yet.{' '}
            <button onClick={() => onNewRun ? onNewRun() : onNavigate('runs')} className="font-medium text-blue-700 hover:underline">
              Start one →
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 font-medium">Scenario</th>
                <th className="pb-2 font-medium">Channel</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Score</th>
                <th className="pb-2 font-medium">Tokens</th>
                <th className="pb-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 font-medium text-slate-800">{r.scenarioName}</td>
                  <td className="py-2.5">
                    <span className={r.channel === 'voice' ? 'badge-voice' : 'badge-chat'}>
                      {r.channel}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="py-2.5">
                    {r.evalResult ? (
                      <div className="flex items-center gap-1.5">
                        {r.evalResult.scenarioType === 'security' && (
                          <span title="Security test" className="rounded px-1.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200 bg-purple-50">🛡 Security</span>
                        )}
                        <span className={r.evalResult.passed ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>
                          {r.evalResult.overallScore.toFixed(1)}/10
                        </span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-2.5">
                    {r.evalResult?.judgeTokenTotalEstimate != null || r.telemetry?.tokenTotalEstimate != null ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-slate-800">
                          Judge {r.evalResult?.judgeTokenTotalEstimate != null ? formatTokenCount(r.evalResult.judgeTokenTotalEstimate) : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Scenario {r.telemetry?.tokenTotalEstimate != null ? formatTokenCount(r.telemetry.tokenTotalEstimate) : '—'}
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" data-tour-target="dashboard-actions">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Quick Actions</h3>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Fast paths</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: '📋 Browse Scenarios', page: 'scenarios' as const, newRun: false },
            { label: '▶️ New Run', page: 'runs' as const, newRun: true },
            { label: '💬 View Transcripts', page: 'transcripts' as const, newRun: false },
            { label: '📊 View Reports', page: 'reports' as const, newRun: false },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => a.newRun && onNewRun ? onNewRun() : onNavigate(a.page)}
              className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 text-center text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-700', green: 'text-green-700', red: 'text-red-600', slate: 'text-slate-800',
  };
  return (
    <div className="card">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${colors[color] ?? 'text-slate-800'}`}>
        {value}{sub && <span className="text-base font-normal text-slate-400">{sub}</span>}
      </p>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: 'badge-pass', failed: 'badge-fail',
    running: 'badge-running', evaluating: 'badge-running', pending: 'badge-pending',
  };
  return <span className={map[status] ?? 'badge-pending'}>{status}</span>;
}
