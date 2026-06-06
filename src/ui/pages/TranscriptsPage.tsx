// src/ui/pages/TranscriptsPage.tsx
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import type { Transcript } from '../../types/transcript.js';
import { RunAgentIcon, RunCustomerIcon, RunFailIcon, RunRunningIcon } from '../components/icons.js';

interface TranscriptFile {
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

export function TranscriptsPage({ initialFilename }: { initialFilename?: string }) {
  const [files, setFiles] = useState<TranscriptFile[]>([]);
  const [selected, setSelected] = useState<Transcript | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoLoadedInitial, setAutoLoadedInitial] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');

  useEffect(() => {
    apiFetch('/api/transcripts')
      .then((d: { transcripts: TranscriptFile[] }) => setFiles(d.transcripts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadTranscript(filename: string) {
    const t = await apiFetch(`/api/transcripts/${filename}`) as Transcript;
    setSelected(t);
  }

  useEffect(() => {
    if (loading || autoLoadedInitial) return;
    if (!initialFilename) {
      setAutoLoadedInitial(true);
      return;
    }
    const exists = files.some((f) => f.filename === initialFilename);
    if (!exists) {
      setAutoLoadedInitial(true);
      return;
    }
    void loadTranscript(initialFilename)
      .catch(() => {})
      .finally(() => setAutoLoadedInitial(true));
  }, [loading, autoLoadedInitial, initialFilename, files]);

  const filtered = files.filter((f) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      f.filename.toLowerCase().includes(q) ||
      (f.runScenarioName ?? '').toLowerCase().includes(q) ||
      (f.runId ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || f.runStatus === statusFilter;
    const matchesChannel =
      channelFilter === 'all' ||
      f.filename.toLowerCase().includes(channelFilter);
    return matchesSearch && matchesStatus && matchesChannel;
  });

  const statuses = Array.from(new Set(files.map((f) => f.runStatus).filter(Boolean))) as string[];

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Conversation history</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Transcripts</h2>
            <p className="text-sm leading-6 text-slate-200/80">
              {filtered.length === files.length
                ? `${files.length} saved transcript(s)`
                : `${filtered.length} of ${files.length} transcript(s)`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search transcripts…"
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
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-white backdrop-blur focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 appearance-none cursor-pointer"
            >
              <option value="all" className="text-slate-900">All channels</option>
              <option value="chat" className="text-slate-900">Chat</option>
              <option value="voice" className="text-slate-900">Voice</option>
            </select>
          </div>
        </div>
      </section>

      <div className="grid md:grid-cols-5 gap-4">
        {/* ── File List ── */}
        <div className="md:col-span-2 space-y-2 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="text-slate-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="card text-slate-400 text-sm">
              {files.length === 0
                ? 'No transcripts yet.'
                : 'No transcripts match your filters.'}
            </div>
          ) : (
            filtered.map((f) => (
              <div key={f.filename} onClick={() => loadTranscript(f.filename)}
                className={`card cursor-pointer transition-all text-sm ${
                  selected?.id && f.filename.includes(selected.id.slice(0, 8))
                    ? 'ring-2 ring-blue-500' : 'hover:shadow-md'
                }`}>
                <p className="font-medium truncate">{f.filename.replace('.json', '').replace(/_/g, ' ')}</p>
                {f.runScenarioName && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="flex items-center gap-1 text-xs text-blue-700 font-medium truncate">
                      <RunRunningIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {f.runScenarioName}
                    </span>
                    <RunBadge status={f.runStatus} />
                  </div>
                )}
                {f.runId && !f.runScenarioName && (
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">Run: {f.runId.slice(0, 8)}…</p>
                )}
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(f.runStartedAt ?? f.modifiedAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>

        {/* ── Transcript Viewer ── */}
        <div className="md:col-span-3">
          {selected ? (
            <div className="card space-y-4">
              <div>
                <h3 className="font-bold text-lg">{selected.scenarioName}</h3>
                <div className="flex gap-2 mt-1">
                  <span className={selected.channel === 'voice' ? 'badge-voice' : 'badge-chat'}>
                    {selected.channel}
                  </span>
                  <span className="text-xs text-slate-400">{selected.startedAt?.slice(0, 16).replace('T', ' ')}</span>
                  {selected.error && <span className="badge-fail">error</span>}
                </div>
              </div>

              {selected.error && (
                <div className="flex items-center gap-2 rounded bg-red-50 p-3 text-sm text-red-700">
                  <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                  {selected.error}
                </div>
              )}

              <div className="space-y-3 max-h-[55vh] overflow-y-auto">
                {selected.turns.map((t) => (
                  <div key={t.index} className={`flex gap-3 ${t.role === 'agent' ? 'flex-row-reverse' : ''}`}>
                    {t.role === 'customer'
                      ? <RunCustomerIcon className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden="true" />
                      : <RunAgentIcon className="mt-1 h-5 w-5 flex-shrink-0 text-slate-500" aria-hidden="true" />}
                    <div className={`rounded-xl px-4 py-3 text-sm max-w-[78%] leading-relaxed ${
                      t.role === 'customer'
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-900'
                    }`}>
                      {t.content}
                      {t.durationMs && (
                        <p className="text-xs mt-1.5 opacity-60">{(t.durationMs / 1000).toFixed(1)}s response</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="card flex items-center justify-center h-48 text-slate-400 text-sm">
              Select a transcript to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
