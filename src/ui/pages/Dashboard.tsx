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
  const [usage, setUsage] = useState<{
    tier: string | null;
    enabled: boolean;
    limits: { maxScenariosPerRun: number; maxRunsPerMonth: number; maxModels: number };
    usage: { runsThisMonth: number; distinctProviderCount: number; distinctProviders: string[] };
  } | null>(null);

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

  useEffect(() => {
    apiFetch('/api/usage')
      .then((d: typeof usage) => setUsage(d))
      .catch(() => {});
  }, []);

  const total = runs.length;
  const passed = runs.filter((r) => r.evalResult?.passed === true).length;
  const failed = runs.filter((r) => r.evalResult?.passed === false).length;

  // Use strict equality so 'mixed' runs are excluded from both buckets.
  const qualityRuns = runs.filter((r) => r.evalResult?.scenarioType === 'quality');
  const securityRuns = runs.filter((r) => r.evalResult?.scenarioType === 'security');

  const scoredRuns = runs.filter((r) => r.evalResult?.overallScore != null && r.evalResult.overallScore > 0);
  const avgScore =
    scoredRuns.length > 0
      ? (scoredRuns.reduce((a, b) => a + (b.evalResult!.overallScore!), 0) / scoredRuns.length).toFixed(1)
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

  const recent = runs.slice(0, 5);

  const readinessBadgeClass =
    readiness.attackBlockRate != null && readiness.attackBlockRate >= 80 && (readiness.avgQualityScore ?? 0) >= 70
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : readiness.attackBlockRate != null && readiness.attackBlockRate < 60
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-amber-50 text-amber-700 ring-amber-200';

  const readinessLabel =
    readiness.attackBlockRate != null && readiness.attackBlockRate >= 80 && (readiness.avgQualityScore ?? 0) >= 70
      ? 'Ship candidate'
      : readiness.attackBlockRate != null && readiness.attackBlockRate < 60
        ? 'Action required'
        : 'Needs review';

  const suggestedAction =
    readiness.attackBlockRate != null && readiness.attackBlockRate < 80
      ? 'Re-run adversarial tests and tighten refusal policy.'
      : readiness.avgQualityScore != null && readiness.avgQualityScore < 70
        ? 'Review failing quality scenarios and adjust judge thresholds.'
        : 'All metrics within acceptable thresholds.';

  return (
    <div className="flex h-[calc(100vh-theme(spacing.16))] flex-col gap-3 overflow-auto lg:overflow-hidden">
      {/* ── Header row: title + stat pills + quick actions ────────────────── */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-5 py-3 text-white shadow-lg" data-tour-target="dashboard-hero">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">Enterprise evaluation hub</p>
            <h2 className="text-xl font-semibold tracking-tight">Dashboard</h2>
          </div>
          <div className="hidden items-center gap-1.5 text-[11px] text-slate-100/90 sm:flex" data-tour-target="dashboard-summary">
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 ring-1 ring-white/10">Runs {total}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 ring-1 ring-white/10">Passed {passed}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 ring-1 ring-white/10">Failed {failed}</span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 ring-1 ring-white/10">Avg {avgScore === '—' ? 'N/A' : `${avgScore}/10`}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5" data-tour-target="dashboard-actions">
          {[
            { label: 'Scenarios', icon: NavScenariosIcon, page: 'scenarios' as const, newRun: false },
            { label: 'New Run', icon: NavRunsIcon, page: 'runs' as const, newRun: true },
            { label: 'Transcripts', icon: NavTranscriptsIcon, page: 'transcripts' as const, newRun: false },
            { label: 'Reports', icon: NavReportsIcon, page: 'reports' as const, newRun: false },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => a.newRun && onNewRun ? onNewRun() : onNavigate(a.page)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/10 transition hover:bg-white/20"
            >
              <span className="inline-flex items-center gap-1.5">
                <a.icon className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                {a.label}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Main body: 3-column grid (lg+), stacked below ────────────────── */}
      {loading ? (
        <div className="card flex-1 flex items-center justify-center text-sm text-slate-400">Loading…</div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[1.1fr_1.6fr_0.85fr]">
          {/* ── LEFT COLUMN: Release Readiness + Observability ──────────── */}
          <div className="flex min-h-0 flex-col gap-3">
            {/* Release Readiness */}
            <div className="card flex-1 space-y-3 overflow-auto" data-tour-target="dashboard-release-readiness">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Release Readiness</h3>
                  <p className="text-[10px] text-slate-400">Based on last 100 runs</p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${readinessBadgeClass}`}>
                  {readinessLabel}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <KpiCard
                  label="Attack Block Rate"
                  value={readiness.attackBlockRate != null ? `${readiness.attackBlockRate}%` : '—'}
                  tone={readiness.attackBlockRate == null ? 'neutral' : readiness.attackBlockRate >= 80 ? 'green' : readiness.attackBlockRate >= 60 ? 'amber' : 'red'}
                  sub={securityRuns.length > 0 ? `${readiness.violationsBlocked}/${securityRuns.length} security` : 'No security runs'}
                />
                <KpiCard
                  label="Avg Quality Score"
                  value={readiness.avgQualityScore != null ? `${readiness.avgQualityScore}%` : '—'}
                  tone={readiness.avgQualityScore == null ? 'neutral' : readiness.avgQualityScore >= 70 ? 'green' : readiness.avgQualityScore >= 50 ? 'amber' : 'red'}
                  sub={qualityRuns.length > 0 ? `${qualityRuns.length} quality runs` : 'No quality runs'}
                />
                <KpiCard
                  label="Violations Blocked"
                  value={String(readiness.violationsBlocked)}
                  tone={readiness.violationsBlocked > 0 ? 'green' : securityRuns.length > 0 ? 'red' : 'neutral'}
                  sub="Attacks stopped"
                />
              </div>

              {/* Completion bar */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Completion rate</span>
                  <span className="font-semibold text-slate-900">
                    {readiness.completionRate != null ? `${readiness.completedCount}/${total}` : '—'}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full bg-cyan-500 transition-all"
                    style={{ width: readiness.completionRate != null ? `${readiness.completionRate}%` : '0%' }}
                  />
                </div>
              </div>

              {/* Insight + Action compact */}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-950 p-3 text-white">
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-cyan-300/80">Insight</p>
                  <p className="mt-1 text-xs leading-5 text-slate-200">{readiness.topInsight}</p>
                </div>
                <div className="rounded-xl border border-slate-200/80 bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-500">Action</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{suggestedAction}</p>
                </div>
              </div>
            </div>

            {/* Observability (compact) */}
            <div className="card space-y-2" data-tour-target="dashboard-observability">
              <h3 className="text-sm font-semibold text-slate-900">Observability <span className="text-[10px] font-normal text-slate-400">(24h)</span></h3>
              {metricsLoading ? (
                <div className="py-3 text-center text-xs text-slate-400">Loading…</div>
              ) : !metrics ? (
                <div className="py-3 text-center text-xs text-slate-400">Unavailable</div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <MiniMetric label="Fail %" value={metrics.totals.failureRatePercent != null ? `${metrics.totals.failureRatePercent.toFixed(1)}%` : '—%'} />
                    <MiniMetric label="Avg Lat." value={metrics.totals.avgLatencyMs != null ? formatLatency(metrics.totals.avgLatencyMs) : '—'} />
                    <MiniMetric label="P95 Lat." value={metrics.totals.p95LatencyMs != null ? formatLatency(metrics.totals.p95LatencyMs) : '—'} />
                    <MiniMetric label="Judge Tok." value={formatTokenCount(metrics.totals.judgeTokenTotalEstimate)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="mb-1 font-semibold text-slate-700">Providers</p>
                      {metrics.providers.length === 0 ? (
                        <p className="text-slate-400">—</p>
                      ) : (
                        <div className="space-y-0.5">
                          {metrics.providers.slice(0, 3).map((p) => (
                            <div key={p.provider} className="flex justify-between">
                              <span className="text-slate-700 truncate">{p.provider}</span>
                              <span className="text-slate-500">{p.runCount} runs{p.failedRuns > 0 ? `, ${p.failedRuns} fail` : ''}</span>
                            </div>
                          ))}
                          {metrics.providers.length > 3 && <p className="text-slate-400">+{metrics.providers.length - 3} more</p>}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-semibold text-slate-700">Failures</p>
                      {metrics.failures.length === 0 ? (
                        <p className="text-slate-400">None</p>
                      ) : (
                        <div className="space-y-0.5">
                          {metrics.failures.slice(0, 3).map((f) => (
                            <div key={f.failureClass} className="flex justify-between">
                              <span className="text-slate-700 truncate">{f.failureClass}</span>
                              <span className="text-slate-500">{f.count}</span>
                            </div>
                          ))}
                          {metrics.failures.length > 3 && <p className="text-slate-400">+{metrics.failures.length - 3} more</p>}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Plan Usage (only shown when limits are enabled) */}
            {usage && usage.enabled && (
              <div className="card space-y-2" data-tour-target="dashboard-plan-usage">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">Plan Usage</h3>
                  <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 ring-1 ring-cyan-200">
                    {usage.tier ? usage.tier.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Unknown'}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <UsageBar
                    label="Runs / month"
                    current={usage.usage.runsThisMonth}
                    max={usage.limits.maxRunsPerMonth}
                  />
                  <UsageBar
                    label="AI providers"
                    current={usage.usage.distinctProviderCount}
                    max={usage.limits.maxModels}
                  />
                  <UsageBar
                    label="Scenarios / run"
                    current={null}
                    max={usage.limits.maxScenariosPerRun}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="card flex min-h-0 flex-col" data-tour-target="dashboard-recent-runs">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Recent Runs</h3>
              <button onClick={() => onNavigate('runs')} className="text-xs font-medium text-blue-700 hover:underline">
                <span className="inline-flex items-center gap-1">
                  View all <ChevronRightIcon className="h-3 w-3" aria-hidden="true" />
                </span>
              </button>
            </div>

            {recent.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                No runs yet.{' '}
                <button onClick={() => onNewRun ? onNewRun() : onNavigate('runs')} className="ml-1 font-medium text-blue-700 hover:underline">
                  Start one →
                </button>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <th className="pb-1.5 font-medium">Scenario</th>
                      <th className="pb-1.5 font-medium">Ch.</th>
                      <th className="pb-1.5 font-medium">Status</th>
                      <th className="pb-1.5 font-medium">Score</th>
                      <th className="pb-1.5 font-medium">Tokens</th>
                      <th className="pb-1.5 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((r) => (
                      <tr key={r.id} className="border-b border-slate-50 last:border-0">
                        <td className="py-2 font-medium text-slate-800 max-w-[200px] truncate" title={r.scenarioName}>{r.scenarioName}</td>
                        <td className="py-2">
                          <span className={r.channel === 'voice' ? 'badge-voice' : 'badge-chat'}>
                            {r.channel}
                          </span>
                        </td>
                        <td className="py-2">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="py-2">
                          {r.evalResult ? (
                            <div className="flex items-center gap-1">
                              {r.evalResult.scenarioType === 'security' && (
                                <span title="Security test" className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-200 bg-purple-50">
                                  <RunSecurityIcon className="h-2.5 w-2.5" aria-hidden="true" />
                                  Sec
                                </span>
                              )}
                              <span className={r.evalResult.passed ? 'font-semibold text-green-700' : 'font-semibold text-red-600'}>
                                {r.evalResult.overallScore.toFixed(1)}/10
                              </span>
                            </div>
                          ) : '—'}
                        </td>
                        <td className="py-2">
                          {(r.evalResult != null) || r.telemetry?.tokenTotalEstimate != null ? (
                            <div className="space-y-0">
                              <p className="text-[10px] font-semibold text-slate-800">
                                J {r.evalResult != null ? formatTokenCount(r.evalResult.judgeTokenTotalEstimate ?? 0) : '—'}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                S {r.telemetry?.tokenTotalEstimate != null ? formatTokenCount(r.telemetry.tokenTotalEstimate) : '—'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Judge Breakdown ───────────────────────────── */}
          <div className="card flex min-h-0 flex-col space-y-3 overflow-auto">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-blue-600">Judge breakdown</p>
              <h4 className="mt-0.5 text-sm font-semibold text-slate-900">Pass rate by type</h4>
            </div>
            <div className="space-y-3">
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
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      {item.label}
                      <span className="ml-1 text-[10px] text-slate-400">({item.count})</span>
                    </span>
                    <span className="font-semibold text-slate-900">{item.rate != null ? `${item.rate}%` : '—'}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100">
                    <div
                      className={`h-1.5 rounded-full transition-all ${item.color}`}
                      style={{ width: item.rate != null ? `${item.rate}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5 text-[10px] text-slate-500 leading-4">
              <span className="font-semibold text-slate-700">Note:</span> Security pass = attack blocked.
              Quality pass = score ≥ 6/10. Mixed-type runs excluded from breakdowns.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function KpiCard({ label, value, tone, sub }: { label: string; value: string; tone: 'green' | 'amber' | 'red' | 'neutral'; sub?: string }) {
  const dotColors: Record<string, string> = {
    green: 'bg-emerald-500', amber: 'bg-amber-400', red: 'bg-rose-500', neutral: 'bg-slate-300',
  };
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dotColors[tone]}`} />
        <p className="text-lg font-semibold text-slate-900">{value}</p>
      </div>
      {sub && <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p>}
    </div>
  );
}

/** Compact usage bar showing current / max for a plan limit. */
function UsageBar({ label, current, max }: { label: string; current: number | null; max: number }) {
  const unlimited = max < 0;
  const pct = unlimited || current == null ? 0 : max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const tone = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-400' : 'bg-cyan-500';
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px] text-slate-600">
        <span>{label}</span>
        <span className="font-semibold text-slate-900">
          {current != null ? current : '—'} / {unlimited ? '∞' : max}
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-100">
        <div className={`h-1 rounded-full ${tone} transition-all`} style={{ width: unlimited ? '0%' : `${pct}%` }} />
      </div>
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
