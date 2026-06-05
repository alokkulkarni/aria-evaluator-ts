// src/ui/pages/Dashboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { formatLatency, formatTokenCount } from '../lib/format.js';
import {
  ChevronRightIcon,
  NavReportsIcon,
  NavRunsIcon,
  NavScenariosIcon,
  NavTranscriptsIcon,
  RunSecurityIcon,
} from '../components/icons.js';

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

  // Use strict equality so 'mixed' runs are excluded from both buckets.
  const qualityRuns = runs.filter((r) => r.evalResult?.scenarioType === 'quality');
  const securityRuns = runs.filter((r) => r.evalResult?.scenarioType === 'security');

  const avgScore =
    qualityRuns.length > 0
      ? (qualityRuns.reduce((a, b) => a + (b.evalResult?.overallScore ?? 0), 0) / qualityRuns.length).toFixed(1)
      : '—';

  // Release readiness KPIs — scoped to the last 100 runs (API default limit).
  const readiness = useMemo(() => {
    const securityBlocked = securityRuns.filter((r) => r.evalResult?.passed === true).length;
    const attackBlockRate =
      securityRuns.length > 0 ? Math.round((securityBlocked / securityRuns.length) * 100) : null;

    const avgQualityScore =
      qualityRuns.length > 0
        ? Math.round((qualityRuns.reduce((a, r) => a + (r.evalResult?.overallScore ?? 0), 0) / qualityRuns.length) * 10)
        : null;

    const completedCount = runs.filter((r) => r.status === 'completed').length;
    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : null;

    // Derive a top insight from the data.
    const topInsight = (() => {
      if (securityRuns.length > 0 && attackBlockRate != null && attackBlockRate < 80) {
        return `${100 - attackBlockRate}% of adversarial attacks were not blocked — review security scenario pass criteria.`;
      }
      if (qualityRuns.length > 0 && avgQualityScore != null && avgQualityScore < 70) {
        return 'Avg quality score is below 70% — consider tuning judge thresholds or reviewing failing scenarios.';
      }
      if (failed > 0) {
        return `${failed} run${failed === 1 ? '' : 's'} failed in the last 100 — check the failure class breakdown below.`;
      }
      return 'All recent evaluation runs are within healthy thresholds.';
    })();

    return { attackBlockRate, avgQualityScore, violationsBlocked: securityBlocked, completionRate, completedCount, topInsight };
  }, [runs, qualityRuns, securityRuns, total, failed]);

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

      {/* ── Executive Overview ─────────────────────────────────────────────── */}
      <section data-tour-target="dashboard-release-readiness">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Release Readiness</h3>
            <p className="text-xs text-slate-400 mt-0.5">Based on last 100 runs</p>
          </div>
          {!loading && (
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
              readiness.attackBlockRate != null && readiness.attackBlockRate >= 80 && (readiness.avgQualityScore ?? 0) >= 70
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : readiness.attackBlockRate != null && readiness.attackBlockRate < 60
                  ? 'bg-rose-50 text-rose-700 ring-rose-200'
                  : 'bg-amber-50 text-amber-700 ring-amber-200'
            }`}>
              {readiness.attackBlockRate != null && readiness.attackBlockRate >= 80 && (readiness.avgQualityScore ?? 0) >= 70
                ? 'Ship candidate'
                : readiness.attackBlockRate != null && readiness.attackBlockRate < 60
                  ? 'Action required'
                  : 'Needs review'}
            </span>
          )}
        </div>

        {loading ? (
          <div className="card py-10 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
            {/* Left: KPIs + completeness + insights */}
            <div className="card space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard
                  label="Attack Block Rate"
                  value={readiness.attackBlockRate != null ? `${readiness.attackBlockRate}%` : '—'}
                  tone={readiness.attackBlockRate == null ? 'neutral' : readiness.attackBlockRate >= 80 ? 'green' : readiness.attackBlockRate >= 60 ? 'amber' : 'red'}
                  sub={securityRuns.length > 0 ? `${readiness.violationsBlocked}/${securityRuns.length} security runs` : 'No security runs'}
                />
                <KpiCard
                  label="Avg Quality Score"
                  value={readiness.avgQualityScore != null ? `${readiness.avgQualityScore}%` : '—'}
                  tone={readiness.avgQualityScore == null ? 'neutral' : readiness.avgQualityScore >= 70 ? 'green' : readiness.avgQualityScore >= 50 ? 'amber' : 'red'}
                  sub={qualityRuns.length > 0 ? `Over ${qualityRuns.length} quality runs` : 'No quality runs'}
                />
                <KpiCard
                  label="Violations Blocked"
                  value={String(readiness.violationsBlocked)}
                  tone={readiness.violationsBlocked > 0 ? 'green' : securityRuns.length > 0 ? 'red' : 'neutral'}
                  sub="Security attacks stopped"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-slate-600">
                  <span>Run completion rate</span>
                  <span className="font-semibold text-slate-900">
                    {readiness.completionRate != null ? `${readiness.completedCount} / ${total}` : '—'}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-cyan-500 transition-all"
                    style={{ width: readiness.completionRate != null ? `${readiness.completionRate}%` : '0%' }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-950 p-4 text-white">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-cyan-300/80">Top insight</p>
                  <p className="mt-2 text-sm leading-6 text-slate-200">{readiness.topInsight}</p>
                </div>
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Suggested action</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {readiness.attackBlockRate != null && readiness.attackBlockRate < 80
                      ? 'Re-run the adversarial test pack and tighten refusal policy before approving release.'
                      : readiness.avgQualityScore != null && readiness.avgQualityScore < 70
                        ? 'Review failing quality scenarios and adjust judge threshold calibration.'
                        : 'Continue monitoring. All metrics are within acceptable thresholds.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Judge comparison by run type */}
            <div className="card space-y-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.28em] text-blue-600">Judge breakdown</p>
                <h4 className="mt-1 text-base font-semibold text-slate-900">Pass rate by scenario type</h4>
              </div>
              <div className="space-y-4">
                {[
                  {
                    label: 'Quality',
                    count: qualityRuns.length,
                    rate: qualityRuns.length > 0
                      ? Math.round((qualityRuns.filter(r => r.evalResult?.passed === true).length / qualityRuns.length) * 100)
                      : null,
                    color: 'bg-emerald-500',
                  },
                  {
                    label: 'Security',
                    count: securityRuns.length,
                    rate: securityRuns.length > 0
                      ? Math.round((securityRuns.filter(r => r.evalResult?.passed === true).length / securityRuns.length) * 100)
                      : null,
                    color: 'bg-cyan-500',
                  },
                  {
                    label: 'All runs',
                    count: total,
                    rate: total > 0 ? Math.round((passed / total) * 100) : null,
                    color: 'bg-blue-500',
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-slate-600">
                        {item.label}
                        <span className="ml-1.5 text-xs text-slate-400">({item.count})</span>
                      </span>
                      <span className="font-semibold text-slate-900">{item.rate != null ? `${item.rate}%` : '—'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100">
                      <div
                        className={`h-2 rounded-full transition-all ${item.color}`}
                        style={{ width: item.rate != null ? `${item.rate}%` : '0%' }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3 text-xs text-slate-500 leading-5">
                <span className="font-semibold text-slate-700">Note:</span> Security pass = attack blocked.
                Quality pass = score ≥ 6/10. Mixed-type runs are excluded from type breakdowns.
              </div>
            </div>
          </div>
        )}
      </section>

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
                  {formatTokenCount(metrics.totals.judgeTokenTotalEstimate)}
                </p>
                <p className="text-[11px] text-slate-500">
                  Scenario turns: {formatTokenCount(metrics.totals.scenarioTokenTotalEstimate)}
                </p>
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
            <span className="inline-flex items-center gap-1">
              View all
              <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400">
            No runs yet.{' '}
            <button onClick={() => onNewRun ? onNewRun() : onNavigate('runs')} className="font-medium text-blue-700 hover:underline">
              <span className="inline-flex items-center gap-1">
                Start one
                <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
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
                          <span title="Security test" className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-purple-700 ring-1 ring-purple-200 bg-purple-50">
                            <RunSecurityIcon className="h-3 w-3" aria-hidden="true" />
                            Security
                          </span>
                        )}
                        <span className={r.evalResult.passed ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>
                          {r.evalResult.overallScore.toFixed(1)}/10
                        </span>
                      </div>
                    ) : '—'}
                  </td>
                  <td className="py-2.5">
                    {(r.evalResult != null) || r.telemetry?.tokenTotalEstimate != null ? (
                      <div className="space-y-0.5">
                        <p className="text-xs font-semibold text-slate-800">
                          Judge {r.evalResult != null ? formatTokenCount(r.evalResult.judgeTokenTotalEstimate ?? 0) : '—'}
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
            { label: 'Browse Scenarios', icon: NavScenariosIcon, page: 'scenarios' as const, newRun: false },
            { label: 'New Run', icon: NavRunsIcon, page: 'runs' as const, newRun: true },
            { label: 'View Transcripts', icon: NavTranscriptsIcon, page: 'transcripts' as const, newRun: false },
            { label: 'View Reports', icon: NavReportsIcon, page: 'reports' as const, newRun: false },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => a.newRun && onNewRun ? onNewRun() : onNavigate(a.page)}
              className="rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-4 text-center text-sm font-medium text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)]"
            >
              <span className="flex items-center justify-center gap-2">
                <a.icon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                {a.label}
              </span>
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

function KpiCard({ label, value, tone, sub }: { label: string; value: string; tone: 'green' | 'amber' | 'red' | 'neutral'; sub?: string }) {
  const dotColors: Record<string, string> = {
    green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-rose-500', neutral: 'bg-slate-300',
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dotColors[tone]}`} />
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
      </div>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
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
