// src/ui/pages/ScenariosPage.tsx
import React, { useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, toApiUrl } from '../lib/api.js';
import { usePlanGate } from '../lib/plan-gate.js';
import type { Scenario } from '../../types/scenario.js';
import { ScenarioBuilderModal } from './ScenarioBuilderModal.js';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CategoryBankingIcon,
  CategoryEdgeCasesIcon,
  CategoryEscalationIcon,
  CategoryGeneralIcon,
  ConversationIcon,
  PowerIcon,
  RunChatIcon,
  RunFailIcon,
  RunMarkerIcon,
  RunVoiceIcon,
  ScenarioAdversarialIcon,
} from '../components/icons.js';

interface ScenarioFile {
  filename: string;
  scenarios: Scenario[];
}

interface RunDetail {
  status: string;
  errorMessage?: string | null;
  evalResult?: { overallScore: number } | null;
}

type LifecycleStatus = 'draft' | 'active' | 'deprecated';

interface ScenarioRevision {
  id: string;
  source: string;
  sourceRef: string;
  changedBy: string | null;
  createdAt: string;
}

type Provider = 'connect' | 'lex' | 'azure' | 'strands' | 'copilot' | 'custom' | 'openapi' | 'websocket';

function supportedChannels(provider: Provider): Array<'chat' | 'voice'> {
  if (provider === 'connect' || provider === 'custom') return ['chat', 'voice'];
  return ['chat'];
}

export function ScenariosPage() {
  const { isBlocked, showUpgradeNudge } = usePlanGate();
  const [files, setFiles] = useState<string[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [channelFilter, setChannelFilter] = useState<'all' | 'chat' | 'voice'>('all');
  const [provider, setProvider] = useState<Provider>('connect');
  const [runState, setRunState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [runId, setRunId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [builder, setBuilder] = useState<{ mode: 'create' | 'edit'; scenario?: Scenario } | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<{ owner: string; lifecycleStatus: LifecycleStatus }>({
    owner: '',
    lifecycleStatus: 'active',
  });
  const [metaSaving, setMetaSaving] = useState(false);
  const [metaNotice, setMetaNotice] = useState<string | null>(null);
  const [revisions, setRevisions] = useState<ScenarioRevision[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [revisionsError, setRevisionsError] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [collapsedSubCategories, setCollapsedSubCategories] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch('/api/scenarios'),
      apiFetch('/api/settings').catch(() => ({ settings: {} })),
    ])
      .then(([scenariosData, settingsData]) => {
        const d = scenariosData as { scenarios: Scenario[] };
        const s = settingsData as { settings?: Record<string, string> };
        setScenarios(d.scenarios ?? []);
        const unique = [...new Set((d.scenarios ?? []).map((sc: Scenario) => sc.filePath?.split('#')[0] ?? ''))];
        setFiles(unique.filter(Boolean));
        const defaultProvider = (s.settings?.['EVAL_PROVIDER_DEFAULT'] ?? 'connect').toLowerCase();
        if (defaultProvider === 'connect' || defaultProvider === 'lex' || defaultProvider === 'azure' || defaultProvider === 'strands' || defaultProvider === 'copilot' || defaultProvider === 'custom' || defaultProvider === 'openapi' || defaultProvider === 'websocket') {
          setProvider(defaultProvider);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (esRef.current) esRef.current.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const filtered = scenarios.filter((s) => {
    const matchesChannel = channelFilter === 'all' || s.channel === channelFilter || s.channel === 'both';
    if (!matchesChannel) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.attack_type ?? '').toLowerCase().includes(q) ||
      (s.goal ?? '').toLowerCase().includes(q) ||
      (s.filePath ?? '').toLowerCase().includes(q) ||
      (s.scenario_id ?? '').toLowerCase().includes(q)
    );
  });

  function cleanup() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Core helper: starts one run and resolves/rejects when it finishes.
  // appendEvent is called for every log/status line so callers can prefix them.
  function runOneChannel(
    scenario: Scenario,
    channel: 'chat' | 'voice',
    appendEvent: (line: string) => void,
  ): Promise<void> {
    const filePath = scenario.filePath?.split('#')[0] ?? '';
    const indexInFile = parseInt(scenario.filePath?.split('#')[1] ?? '0', 10);

    return apiFetch('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ scenarioFile: filePath, scenarioIndex: indexInFile, channel, provider }),
    }).then((raw) => {
      const data = raw as { runId: string };
      setRunId(data.runId);

      return new Promise<void>((resolve, reject) => {
        const es = new EventSource(toApiUrl(`/api/runs/${data.runId}/events`), { withCredentials: true });
        esRef.current = es;

        const finish = (scoreLine?: string) => {
          cleanup();
          if (scoreLine) appendEvent(scoreLine);
          resolve();
        };
        const fail = (msg: string) => {
          cleanup();
          reject(new Error(msg));
        };

        pollRef.current = setInterval(async () => {
          try {
            const d = await apiFetch(`/api/runs/${data.runId}`) as { run: RunDetail };
            if (d.run?.status === 'completed') {
              const score = typeof d.run?.evalResult?.overallScore === 'number'
                ? ` — Score: ${d.run.evalResult.overallScore}/10` : '';
              finish(`Complete${score}`);
            } else if (d.run?.status === 'failed') {
              fail(d.run?.errorMessage ?? 'Run failed');
            }
          } catch { /* ignore transient */ }
        }, 3000);

        es.addEventListener('log', (e) => {
          appendEvent((JSON.parse(e.data) as { message: string }).message);
        });
        es.addEventListener('queued', (e) => {
          const d = JSON.parse(e.data) as { message?: string };
          appendEvent(d.message ?? '🕒 Run queued');
        });
        es.addEventListener('start', (e) => {
          const d = JSON.parse(e.data) as {
            message?: string;
            provider?: string;
            channel?: string;
            scenarioCount?: number;
          };
          const fallback = `Run started (${d.provider ?? 'unknown'} · ${d.channel ?? 'chat'} · ${d.scenarioCount ?? 0} scenario(s))`;
          appendEvent(d.message ?? fallback);
        });
        es.addEventListener('complete', (e) => {
          const d = JSON.parse(e.data) as { overallScore?: number };
          const score = typeof d.overallScore === 'number' ? ` — Score: ${d.overallScore}/10` : '';
          finish(`Complete${score}`);
        });
        es.addEventListener('failed', (e) => {
          fail((JSON.parse(e.data) as { error: string }).error);
        });
      });
    });
  }

  async function startRun(scenario: Scenario, channel: 'chat' | 'voice') {
    if (isBlocked('run')) { showUpgradeNudge('run'); return; }
    cleanup();
    setRunState('running');
    setLiveEvents([]);
    setRunError(null);
    try {
      await runOneChannel(scenario, channel, (line) => setLiveEvents((p) => [...p, line]));
      setRunState('done');
    } catch (err) {
      setRunError(err instanceof ApiError ? err.error ?? err.message : (err as Error).message);
      setRunState('error');
    }
  }

  async function startBothRun(scenario: Scenario) {
    if (isBlocked('run')) { showUpgradeNudge('run'); return; }
    cleanup();
    setRunState('running');
    setLiveEvents(['-- Chat --']);
    setRunError(null);
    try {
      await runOneChannel(scenario, 'chat', (line) => setLiveEvents((p) => [...p, line]));
      setLiveEvents((p) => [...p, '', '-- Voice --']);
      await runOneChannel(scenario, 'voice', (line) => setLiveEvents((p) => [...p, line]));
      setRunState('done');
    } catch (err) {
      setRunError(err instanceof ApiError ? err.error ?? err.message : (err as Error).message);
      setRunState('error');
    }
  }

  async function reloadScenarios() {
    try {
      const data = await apiFetch('/api/scenarios') as { scenarios: Scenario[] };
      const nextScenarios = data.scenarios ?? [];
      setScenarios(nextScenarios);
      setSelected((prev) => {
        if (!prev) return prev;
        return nextScenarios.find((scenario) => (
          (prev.scenario_id && scenario.scenario_id === prev.scenario_id)
          || scenario.filePath === prev.filePath
        )) ?? prev;
      });
      const unique = [...new Set(nextScenarios.map((sc: Scenario) => sc.filePath?.split('#')[0] ?? ''))];
      setFiles(unique.filter(Boolean));
    } catch { /* ignore */ }
  }

  function applyScenarioMetadata(scenarioId: string, patch: Partial<Scenario>) {
    setScenarios((prev) => prev.map((scenario) => (
      scenario.scenario_id === scenarioId ? { ...scenario, ...patch } : scenario
    )));
    setSelected((prev) => (
      prev && prev.scenario_id === scenarioId ? { ...prev, ...patch } : prev
    ));
  }

  async function loadRevisions(scenario: Scenario) {
    if (!scenario.scenario_id) {
      setRevisions([]);
      setRevisionsError('Save this scenario once to assign a stable Scenario ID before revisions can be tracked.');
      return;
    }
    setRevisionsLoading(true);
    setRevisionsError(null);
    try {
      const data = await apiFetch(`/api/scenarios/revisions?scenarioId=${encodeURIComponent(scenario.scenario_id)}`) as {
        revisions?: ScenarioRevision[];
      };
      setRevisions(data.revisions ?? []);
    } catch (err) {
      setRevisions([]);
      setRevisionsError((err as Error).message);
    } finally {
      setRevisionsLoading(false);
    }
  }

  async function saveScenarioMetadata() {
    if (!selected?.scenario_id || !selected.filePath) {
      setMetaNotice('This scenario does not have a stable ID yet. Save it from Edit first.');
      return;
    }
    setMetaSaving(true);
    setMetaNotice(null);
    try {
      const body = {
        scenarioId: selected.scenario_id,
        scenarioRef: selected.filePath,
        owner: metadataDraft.owner.trim() || null,
        lifecycleStatus: metadataDraft.lifecycleStatus,
      };
      const data = await apiFetch('/api/scenarios/metadata', {
        method: 'PATCH',
        body: JSON.stringify(body),
      }) as {
        metadata?: {
          owner?: string | null;
          lifecycleStatus?: LifecycleStatus;
          revisionCount?: number;
          lastRevisionAt?: string | null;
        };
      };

      applyScenarioMetadata(selected.scenario_id, {
        owner: data.metadata?.owner ?? null,
        lifecycle_status: data.metadata?.lifecycleStatus ?? metadataDraft.lifecycleStatus,
        revision_count: data.metadata?.revisionCount ?? selected.revision_count,
        last_revision_at: data.metadata?.lastRevisionAt ?? selected.last_revision_at ?? null,
      });
      setMetaNotice('Scenario metadata saved.');
    } catch (err) {
      if (err instanceof ApiError && err.error) {
        setMetaNotice(err.error);
      } else {
        setMetaNotice((err as Error).message);
      }
    } finally {
      setMetaSaving(false);
    }
  }

  useEffect(() => {
    if (!selected) {
      setMetadataDraft({ owner: '', lifecycleStatus: 'active' });
      setMetaNotice(null);
      setRevisions([]);
      setRevisionsError(null);
      return;
    }
    setMetadataDraft({
      owner: selected.owner ?? '',
      lifecycleStatus: selected.lifecycle_status ?? 'active',
    });
    setMetaNotice(null);
    void loadRevisions(selected);
  }, [selected]);

  return (
    <>
    {builder && (
      <ScenarioBuilderModal
        mode={builder.mode}
        scenario={builder.scenario}
        existingFiles={files}
        onClose={() => setBuilder(null)}
        onSaved={() => { void reloadScenarios(); }}
      />
    )}
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Scenario library</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Scenarios</h2>
            <p className="text-sm leading-6 text-slate-200/80">
              {filtered.length === scenarios.length
                ? `${scenarios.length} scenario(s) available`
                : `${filtered.length} of ${scenarios.length} scenario(s)`}
            </p>
          </div>
          <input
            type="text"
            placeholder="Search scenarios…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder-slate-400 backdrop-blur focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400 w-48"
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 md:hidden">Scenarios</h2>
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => { if (isBlocked('scenario')) { showUpgradeNudge('scenario'); return; } setBuilder({ mode: 'create' }); }}
            className="btn-primary px-4 py-2 text-sm font-semibold">
            <PowerIcon className="h-4 w-4" aria-hidden="true" />
            New Scenario
          </button>
          <div className="flex gap-1">
            {(['connect', 'lex', 'azure', 'strands', 'copilot', 'custom', 'openapi', 'websocket'] as const).map((p) => (
              <button key={p} onClick={() => setProvider(p)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  provider === p
                    ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}>
                {p}
              </button>
            ))}
          </div>
          {(['all', 'chat', 'voice'] as const).map((c) => (
            <button key={c} onClick={() => setChannelFilter(c)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                channelFilter === c
                  ? 'bg-slate-950 text-white border-slate-950 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}>
              {c === 'all' ? 'All' : (
                <span className="inline-flex items-center gap-1">
                  {c === 'chat' ? <ConversationIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <RunVoiceIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                  {c === 'chat' ? 'Chat' : 'Voice'}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ── Scenario List (categorised) ── */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-slate-400 text-sm">Loading scenarios…</div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-400 text-sm">
              {scenarios.length === 0 ? 'No scenarios found.' : 'No scenarios match your filters.'}
            </div>
          ) : (() => {
            // Build two-level grouping: category → subCategory → scenarios
            const grouped = new Map<string, Map<string, Scenario[]>>();
            for (const s of filtered) {
              const raw = (s.filePath ?? '').split('#')[0]!.replace(/\\/g, '/');
              const parts = raw.split('/').filter(Boolean);
              const cat = parts.length >= 2 ? (parts[0] ?? 'general') : 'general';
              const sub = (parts.length >= 2 ? parts[1] : parts[0] ?? 'other')!.replace(/\.(ya?ml)$/i, '');
              if (!grouped.has(cat)) grouped.set(cat, new Map());
              const subMap = grouped.get(cat)!;
              if (!subMap.has(sub)) subMap.set(sub, []);
              subMap.get(sub)!.push(s);
            }
            const catMeta: Record<string, { icon: React.ComponentType<{ className?: string }>; colour: string }> = {
              adversarial: { icon: ScenarioAdversarialIcon, colour: 'bg-red-50 border-red-200 text-red-800' },
              banking:     { icon: CategoryBankingIcon, colour: 'bg-blue-50 border-blue-200 text-blue-800' },
              edge_cases:  { icon: CategoryEdgeCasesIcon, colour: 'bg-purple-50 border-purple-200 text-purple-800' },
              escalation:  { icon: CategoryEscalationIcon, colour: 'bg-amber-50 border-amber-200 text-amber-800' },
              general:     { icon: CategoryGeneralIcon, colour: 'bg-slate-50 border-slate-200 text-slate-700' },
            };
            const fmt = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            const toggleCat = (cat: string) => setCollapsedCategories(prev => {
              const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n;
            });
            const toggleSub = (key: string) => setCollapsedSubCategories(prev => {
              const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
            });

            return Array.from(grouped.entries()).map(([cat, subMap]) => {
              const meta = catMeta[cat] ?? catMeta.general!;
              const catCollapsed = collapsedCategories.has(cat);
              const totalInCat = Array.from(subMap.values()).reduce((a, v) => a + v.length, 0);
              return (
                <div key={cat} className="rounded-2xl border border-slate-200/80 overflow-hidden shadow-[0_12px_30px_rgba(15,23,42,0.06)] bg-white/90">
                  {/* Category header */}
                  <button
                    onClick={() => toggleCat(cat)}
                    className={`w-full flex items-center justify-between px-4 py-3 font-semibold text-sm ${meta.colour} border-b border-inherit`}>
                    <span className="flex items-center gap-2">
                      <meta.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{fmt(cat)}</span>
                      <span className="ml-1 px-2 py-0.5 rounded-full bg-white/60 text-xs font-bold">{totalInCat}</span>
                    </span>
                    <span className="text-lg text-slate-500">
                      {catCollapsed ? <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /> : <ChevronDownIcon className="h-4 w-4" aria-hidden="true" />}
                    </span>
                  </button>

                  {!catCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {Array.from(subMap.entries()).map(([sub, items]) => {
                        const subKey = `${cat}/${sub}`;
                        const subCollapsed = collapsedSubCategories.has(subKey);
                        return (
                          <div key={sub}>
                            {/* Sub-category header */}
                            <button
                              onClick={() => toggleSub(subKey)}
                              className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-600 transition-colors">
                              <span>{fmt(sub)} <span className="font-normal text-slate-400">({items.length})</span></span>
                              <span className="text-slate-400">
                                {subCollapsed ? <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                              </span>
                            </button>

                            {!subCollapsed && items.map((s, i) => (
                              <div key={i}
                                onClick={() => setSelected(s)}
                                className={`px-4 py-3 cursor-pointer transition-all hover:bg-slate-50 ${
                                  selected === s ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                                }`}>
                                <div className="flex items-start justify-between">
                                  <p className="font-medium text-slate-800 text-sm leading-snug pr-2">{s.name}</p>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                      s.channel === 'voice' ? 'bg-purple-100 text-purple-700' :
                                      s.channel === 'both'  ? 'bg-green-100 text-green-700' :
                                                              'bg-blue-100 text-blue-700'
                                    }`}>
                                      {s.channel === 'both' ? 'Both' : s.channel === 'voice' ? 'Voice' : 'Chat'}
                                    </span>
                                    <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${
                                      (s.lifecycle_status ?? 'active') === 'deprecated'
                                        ? 'bg-rose-100 text-rose-700'
                                        : (s.lifecycle_status ?? 'active') === 'draft'
                                          ? 'bg-amber-100 text-amber-700'
                                          : 'bg-emerald-100 text-emerald-700'
                                    }`}>
                                      {s.lifecycle_status ?? 'active'}
                                    </span>
                                  </div>
                                </div>
                                {s.goal && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{s.goal}</p>}
                              </div>
                            ))}
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

        {/* ── Scenario Detail + Run ── */}
        <div>
          {selected ? (
            <div className="card space-y-4 sticky top-6">
              <h3 className="font-bold text-lg text-slate-900">{selected.name}</h3>
              {selected.description && <p className="text-sm text-slate-600">{selected.description}</p>}
              <table className="text-sm w-full">
                <tbody>
                  {[
                    ['Scenario ID', selected.scenario_id ?? '—'],
                    ['Lifecycle', selected.lifecycle_status ?? 'active'],
                    ['Owner', selected.owner ?? '—'],
                    ['Channel', selected.channel],
                    ['Authenticated', selected.authenticated ? 'Yes' : 'No'],
                    ['Max turns', selected.max_turns ?? '—'],
                    ['Timeout', `${selected.default_timeout_seconds ?? 120}s`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-500 font-medium w-1/3">{k}</td>
                      <td className="py-1.5 text-slate-800">{String(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Management metadata</p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    type="text"
                    value={metadataDraft.owner}
                    onChange={(e) => setMetadataDraft((prev) => ({ ...prev, owner: e.target.value }))}
                    placeholder="Owner (optional)"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    disabled={!selected.scenario_id}
                  />
                  <select
                    value={metadataDraft.lifecycleStatus}
                    onChange={(e) => setMetadataDraft((prev) => ({ ...prev, lifecycleStatus: e.target.value as LifecycleStatus }))}
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                    disabled={!selected.scenario_id}
                  >
                    <option value="active">active</option>
                    <option value="draft">draft</option>
                    <option value="deprecated">deprecated</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void saveScenarioMetadata()}
                    disabled={metaSaving || !selected.scenario_id}
                    className="btn-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {metaSaving ? 'Saving…' : 'Save metadata'}
                  </button>
                  {metaNotice && <p className="text-xs text-slate-600">{metaNotice}</p>}
                </div>
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revision history</p>
                {revisionsLoading ? (
                  <p className="text-xs text-slate-400">Loading revisions…</p>
                ) : revisionsError ? (
                  <p className="text-xs text-amber-700">{revisionsError}</p>
                ) : revisions.length === 0 ? (
                  <p className="text-xs text-slate-400">No revisions tracked yet.</p>
                ) : (
                  <div className="max-h-36 space-y-1 overflow-y-auto">
                    {revisions.map((revision) => (
                      <div key={revision.id} className="rounded bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{revision.source}</span>
                          <span className="text-slate-400">{new Date(revision.createdAt).toLocaleString()}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {revision.changedBy ? `by ${revision.changedBy}` : 'by system'} · {revision.sourceRef}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selected.goal && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Goal</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded p-2">{selected.goal}</p>
                </div>
              )}
              {selected.customer_persona && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Persona</p>
                  <p className="text-sm text-slate-700 bg-slate-50 rounded p-2">{selected.customer_persona}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  disabled={runState === 'running' || !supportedChannels(provider).includes('chat')}
                  onClick={() => startRun(selected, 'chat')}
                  className="btn-primary flex-1 disabled:opacity-50">
                  {runState === 'running' ? 'Running…' : (
                    <span className="inline-flex items-center gap-1">
                      <RunChatIcon className="h-4 w-4" aria-hidden="true" />
                      Chat
                    </span>
                  )}
                </button>
                <button
                  disabled={runState === 'running' || !supportedChannels(provider).includes('voice')}
                  onClick={() => startRun(selected, 'voice')}
                  className="btn-secondary flex-1 disabled:opacity-50">
                  <span className="inline-flex items-center gap-1">
                    <RunVoiceIcon className="h-4 w-4" aria-hidden="true" />
                    Voice
                  </span>
                </button>
                {supportedChannels(provider).includes('voice') && (
                  <button
                    disabled={runState === 'running'}
                    onClick={() => void startBothRun(selected)}
                    title="Run on Chat then Voice sequentially"
                    className="px-3 py-2 text-sm font-medium border-2 border-purple-300 text-purple-700 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 transition-colors flex-1">
                    {runState === 'running' ? 'Running…' : (
                      <span className="inline-flex items-center gap-1">
                        <RunMarkerIcon className="h-4 w-4" aria-hidden="true" />
                        Both
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={() => setBuilder({ mode: 'edit', scenario: selected })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  title="Edit this scenario">
                  <span className="inline-flex items-center gap-1">
                    <RunMarkerIcon className="h-4 w-4" aria-hidden="true" />
                    Edit
                  </span>
                </button>
              </div>

              {/* Live output */}
              {liveEvents.length > 0 && (
                <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono max-h-48 overflow-y-auto space-y-1">
                  {liveEvents.map((e, i) => <div key={i}>{e}</div>)}
                  {runState === 'running' && <div className="animate-pulse text-slate-400">…</div>}
                </div>
              )}
              {runError && (
                <p className="inline-flex items-center gap-1 text-sm text-red-600">
                  <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                  {runError}
                </p>
              )}
            </div>
          ) : (
            <div className="card flex items-center justify-center h-48 text-slate-400 text-sm">
              Select a scenario to view details and run
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
