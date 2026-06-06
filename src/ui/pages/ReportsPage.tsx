// src/ui/pages/ReportsPage.tsx
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import { ChevronRightIcon, NavReportsIcon, RunRunningIcon } from '../components/icons.js';

interface ReportFile {
  filename: string;
  size: number;
  modifiedAt: string;
  runId: string | null;
  runScenarioName: string | null;
  runStatus: string | null;
  runStartedAt: string | null;
}

function RunBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const colours: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
    pending: 'bg-slate-100 text-slate-600',
  };
  const cls = colours[status] ?? 'bg-slate-100 text-slate-600';
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${cls}`}>{status}</span>;
}

export function ReportsPage() {
  const [reports, setReports] = useState<ReportFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    apiFetch('/api/reports')
      .then((d: { reports: ReportFile[] }) => {
        const html = (d.reports ?? []).filter((r) => r.filename.endsWith('.html'));
        setReports(html);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = reports.filter((r) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      r.filename.toLowerCase().includes(q) ||
      (r.runScenarioName ?? '').toLowerCase().includes(q) ||
      (r.runId ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || r.runStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statuses = Array.from(new Set(reports.map((r) => r.runStatus).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Shared outputs</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Reports</h2>
            <p className="text-sm leading-6 text-slate-200/80">
              {filtered.length === reports.length
                ? `${reports.length} evaluation report(s)`
                : `${filtered.length} of ${reports.length} report(s)`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search reports…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-slate-400 backdrop-blur focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 w-48"
            />
            {statuses.length > 0 && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-white backdrop-blur focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 appearance-none cursor-pointer"
              >
                <option value="all" className="text-slate-900">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s} className="text-slate-900">{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-4 gap-4">
        {/* ── Report List ── */}
        <div className="md:col-span-1 space-y-2 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-slate-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="card text-slate-400 text-sm">
              {reports.length === 0
                ? 'No reports yet. Run an evaluation to generate one.'
                : 'No reports match your filters.'}
            </div>
          ) : (
            filtered.map((r) => {
              const url = `/reports/${r.filename}`;
              return (
                <div key={r.filename}
                  onClick={() => setSelectedUrl(url)}
                  className={`card cursor-pointer transition-all text-sm ${
                  selectedUrl === url ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                  }`}>
                  <p className="flex items-center gap-1.5 font-medium truncate">
                    <NavReportsIcon className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    {r.filename.replace('report_', '').replace('.html', '')}
                  </p>
                  {r.runScenarioName && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="flex items-center gap-1 text-xs text-blue-700 font-medium truncate">
                        <RunRunningIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        {r.runScenarioName}
                      </span>
                      <RunBadge status={r.runStatus} />
                    </div>
                  )}
                  {r.runId && !r.runScenarioName && (
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">Run: {r.runId.slice(0, 8)}…</p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(r.runStartedAt ?? r.modifiedAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-slate-400">{(r.size / 1024).toFixed(1)} KB</p>
                  <a href={url} target="_blank" rel="noopener"
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs text-blue-600 hover:underline mt-1 block">
                    <span className="inline-flex items-center gap-1">
                      Open in new tab
                      <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </a>
                </div>
              );
            })
          )}
        </div>

        {/* ── Report Viewer ── */}
        <div className="md:col-span-3">
          {selectedUrl ? (
            <div className="card p-0 overflow-hidden h-[70vh]">
              <iframe
                src={selectedUrl}
                title="Report"
                className="w-full h-full border-0 rounded-xl"
              />
            </div>
          ) : (
            <div className="card flex items-center justify-center h-48 text-slate-400 text-sm">
              Select a report to preview
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
