// src/ui/pages/ReviewQueuePage.tsx
// Judge calibration — review queue, score override, and calibration summary.

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import type { Turn } from '../../types/transcript.js';
import { RunAgentIcon, RunFailIcon, RunMarkerIcon, RunPassIcon } from '../components/icons.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'overridden' | 'rejected';

interface EvalResultSummary {
  id: string;
  overallScore: number;
  passed: boolean;
  summary: string;
  recommendation?: string | null;
  judgeModel: string;
  scenarioType?: string;
  dimensionScores: string; // JSON string
  createdAt: string;
}

interface ReviewerSummary {
  id: string;
  username: string;
}

interface RunSummary {
  id: string;
  scenarioName: string;
  status: string;
  channel: string;
  createdAt: string;
}

interface Review {
  id: string;
  runId: string;
  status: ReviewStatus;
  evalResult: EvalResultSummary;
  reviewer: ReviewerSummary | null;
  reviewedAt: string | null;
  scoreOverride: number | null;
  passedOverride: boolean | null;
  notes: string | null;
  dimensionOverridesJson: string | null;
  queuedAt: string;
  run?: RunSummary | null;
}

interface ReviewDetail extends Review {
  run?: (RunSummary & { turns?: Turn[] }) | null;
}

interface CalibrationSummary {
  total: number;
  byStatus: Record<ReviewStatus, number>;
  agreementRate: number | null;
  avgAiScore: number | null;
  avgHumanScore: number | null;
  avgDisagreement: number | null;
  overriddenCount: number;
  completedCount: number;
  dimensionStats: Record<string, {
    aiAvg: number;
    humanAvg: number;
    disagreementAvg: number;
    count: number;
  }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: ReviewStatus): string {
  switch (status) {
    case 'pending':    return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70';
    case 'in_review':  return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70';
    case 'approved':   return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70';
    case 'overridden': return 'bg-orange-50 text-orange-700 ring-1 ring-orange-200/70';
    case 'rejected':   return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70';
  }
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-600';
  if (score >= 6) return 'text-yellow-600';
  return 'text-red-600';
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── CalibrationPanel ─────────────────────────────────────────────────────────

function CalibrationPanel() {
  const [summary, setSummary] = useState<CalibrationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch('/api/reviews/calibration/summary') as CalibrationSummary;
        setSummary(data);
      } catch {
        // non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-slate-400 text-sm">Loading calibration stats…</div>;
  if (!summary) return null;

  const topDisagreements = Object.entries(summary.dimensionStats)
    .sort(([, a], [, b]) => b.disagreementAvg - a.disagreementAvg)
    .slice(0, 5);

  return (
    <div className="card space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Calibration summary</h2>
          <p className="mt-1 text-sm text-slate-500">Judge agreement and override trends across the current queue.</p>
        </div>
      </div>

      {/* Counts by status */}
      <div className="grid grid-cols-2 gap-3 text-center md:grid-cols-5">
        {(['pending', 'in_review', 'approved', 'overridden', 'rejected'] as ReviewStatus[]).map((s) => (
          <div key={s} className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
            <div className="text-2xl font-semibold tracking-tight text-slate-900">{summary.byStatus[s] ?? 0}</div>
            <div className="text-xs uppercase tracking-[0.2em] text-slate-500 capitalize">{s.replace('_', ' ')}</div>
          </div>
        ))}
      </div>

      {/* Agreement metrics */}
      {summary.completedCount > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-center">
            <div className="text-lg font-semibold text-slate-900">
              {summary.agreementRate !== null ? `${Math.round(summary.agreementRate * 100)}%` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Agreement rate</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-center">
            <div className={`text-lg font-semibold ${summary.avgAiScore !== null ? scoreColor(summary.avgAiScore) : 'text-slate-400'}`}>
              {summary.avgAiScore !== null ? `${summary.avgAiScore}/10` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Avg AI score</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-center">
            <div className={`text-lg font-semibold ${summary.avgHumanScore !== null ? scoreColor(summary.avgHumanScore) : 'text-slate-400'}`}>
              {summary.avgHumanScore !== null ? `${summary.avgHumanScore}/10` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Avg human score</div>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-3 text-center">
            <div className="text-lg font-semibold text-slate-900">
              {summary.avgDisagreement !== null ? `${summary.avgDisagreement}/10` : '—'}
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Avg disagreement</div>
          </div>
        </div>
      )}

      {/* Top disagreement dimensions */}
      {topDisagreements.length > 0 && (
        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500 mb-3">Top dimension disagreements</div>
          <div className="space-y-1">
            {topDisagreements.map(([dimId, stats]) => (
              <div key={dimId} className="flex items-center gap-3 text-sm rounded-xl bg-white/80 px-3 py-2 border border-slate-200/80">
                <span className="flex-1 font-medium text-slate-800 capitalize">{dimId.replace(/_/g, ' ')}</span>
                <span className="text-slate-500 text-xs">AI {stats.aiAvg.toFixed(1)}</span>
                <span className="text-slate-500 text-xs">Human {stats.humanAvg.toFixed(1)}</span>
                <span className="text-orange-600 text-xs font-semibold">Δ {stats.disagreementAvg.toFixed(1)}</span>
                <span className="text-slate-400 text-xs">({stats.count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ReviewDetailPanel ────────────────────────────────────────────────────────

interface ReviewDetailPanelProps {
  reviewId: string;
  onClose: () => void;
  onUpdated: () => void;
}

// Detect scenario-injection markers: lines that are purely === label ===
function isScenarioMarker(content: string): boolean {
  return /^===\s*.+\s*===\s*$/.test(content.trim());
}

function extractMarkerLabel(content: string): string {
  return content.trim().replace(/^===\s*/, '').replace(/\s*===\s*$/, '').replace(/_/g, ' ');
}

// A single conversation bubble
function ConversationTurn({ turn }: { turn: Turn }) {
  const trimmed = turn.content.trim();

  if (isScenarioMarker(trimmed)) {
    return (
      <div className="flex justify-center my-2">
        <span className="px-3 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-medium border border-slate-200">
          <RunMarkerIcon className="mr-1 inline h-3 w-3 align-[-0.15em]" aria-hidden="true" />
          {extractMarkerLabel(trimmed)}
        </span>
      </div>
    );
  }

  const isAgent = turn.role === 'agent';
  return (
    <div className={`flex ${isAgent ? 'justify-start' : 'justify-end'} gap-2`}>
      {isAgent && (
        <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
          A
        </div>
      )}
      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isAgent
          ? 'bg-blue-50 text-blue-900 rounded-tl-sm'
          : 'bg-slate-100 text-slate-800 rounded-tr-sm'
      }`}>
        <p className="whitespace-pre-wrap break-words">{trimmed}</p>
        {turn.durationMs !== undefined && turn.durationMs > 0 && (
          <p className={`text-xs mt-1 ${isAgent ? 'text-blue-400' : 'text-slate-400'}`}>
            {turn.durationMs < 1000 ? `${turn.durationMs}ms` : `${(turn.durationMs / 1000).toFixed(1)}s`}
          </p>
        )}
      </div>
      {!isAgent && (
        <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
          C
        </div>
      )}
    </div>
  );
}

// Score bar (0–10)
function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-mono font-bold w-7 text-right ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

function ReviewDetailPanel({ reviewId, onClose, onUpdated }: ReviewDetailPanelProps) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allDimsExpanded, setAllDimsExpanded] = useState(true);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());

  const [statusDraft, setStatusDraft] = useState<ReviewStatus>('pending');
  const [scoreDraft, setScoreDraft] = useState<string>('');
  const [passDraft, setPassDraft] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch(`/api/reviews/${reviewId}`) as {
          review: ReviewDetail;
          run?: RunSummary & { turns?: Turn[] };
        };
        const r = { ...data.review, run: data.run ?? data.review.run };
        setReview(r);
        setScoreDraft(r.scoreOverride !== null ? String(r.scoreOverride) : '');
        setPassDraft(r.passedOverride !== null ? (r.passedOverride ? 'pass' : 'fail') : '');
        setNotesDraft(r.notes ?? '');
        // Start all dimension cards expanded
        try {
          const dims = JSON.parse(r.evalResult.dimensionScores) as Record<string, unknown>;
          setExpandedDims(new Set(Object.keys(dims)));
        } catch { /* ignore */ }

        // Auto-transition pending → in_review when reviewer opens the modal
        if (r.status === 'pending') {
          try {
            await apiFetch(`/api/reviews/${r.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'in_review' }),
            });
            setStatusDraft('in_review');
          } catch {
            // If transition fails just show current status — reviewer can still try to save
            setStatusDraft(r.status);
          }
        } else {
          setStatusDraft(r.status);
        }
      } catch (err) {
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [reviewId]);

  const handleSave = useCallback(async () => {
    if (!review) return;
    setSaving(true);
    setSaveError(null);
    try {
      const scoreNum = scoreDraft.trim() !== '' ? parseFloat(scoreDraft) : null;
      if (scoreNum !== null && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10)) {
        setSaveError('Score override must be a number between 0 and 10');
        setSaving(false);
        return;
      }
      await apiFetch(`/api/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusDraft,
          scoreOverride: scoreNum,
          passedOverride: passDraft === 'pass' ? true : passDraft === 'fail' ? false : null,
          notes: notesDraft.trim() || null,
        }),
      });
      onUpdated();
      onClose();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [review, statusDraft, scoreDraft, passDraft, notesDraft, onUpdated, onClose]);

  function toggleDim(dimId: string) {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dimId)) { next.delete(dimId); } else { next.add(dimId); }
      // Sync master toggle based on resulting state
      setAllDimsExpanded(next.size === dimIds.length);
      return next;
    });
  }

  function toggleAllDims(dimIds: string[]) {
    if (allDimsExpanded) {
      setExpandedDims(new Set());
      setAllDimsExpanded(false);
    } else {
      setExpandedDims(new Set(dimIds));
      setAllDimsExpanded(true);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 text-slate-600 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">Loading…</div>
      </div>
    );
  }

  if (!review || loadError) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="rounded-3xl border border-slate-200/80 bg-white/95 p-8 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
          <p className="text-red-600">{loadError ?? 'Failed to load review'}</p>
          <button className="mt-3 text-sm text-slate-500 underline" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const aiScore = review.evalResult.overallScore;
  type DimScore = { score: number; justification: string; evidence?: string };
  const dimScores: Record<string, DimScore> = (() => {
    try { return JSON.parse(review.evalResult.dimensionScores) as Record<string, DimScore>; }
    catch { return {}; }
  })();
  const dimIds = Object.keys(dimScores);
  const turns = review.run?.turns ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.2)]">

        {/* ── Modal header ── */}
        <div className="flex items-start justify-between rounded-t-3xl border-b border-slate-100 px-6 py-4 flex-shrink-0">
          <div>
            <h3 className="text-base font-semibold tracking-tight text-slate-900 leading-tight">
              {review.run?.scenarioName ?? 'Review'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Run {review.runId.slice(0, 8)}…
              {' · '}Queued {fmtDate(review.queuedAt)}
              {' · '}Judge: <span className="font-mono">{review.evalResult.judgeModel}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-4 text-slate-400 hover:text-slate-700 text-2xl leading-none mt-0.5"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* ── Main body: two-column ── */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[55%_45%]">

          {/* ── Left: Conversation ── */}
          <div className="flex flex-col min-h-0 border-r border-slate-100 bg-slate-50/40">
            <div className="flex-shrink-0 border-b border-slate-100 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Conversation
                {turns.length > 0 && <span className="ml-1.5 text-slate-400 font-normal normal-case">({turns.length} turns)</span>}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {turns.length === 0 ? (
                review.run === null || review.run === undefined ? (
                  <div className="flex flex-col items-center justify-center h-full text-center py-10">
                    <RunFailIcon className="mb-2 h-8 w-8 text-slate-300" aria-hidden="true" />
                    <p className="text-sm font-medium text-slate-700">Transcript unavailable</p>
                    <p className="mt-1 text-xs text-slate-500">The run associated with this review was deleted.</p>
                  </div>
                ) : (
                  <p className="py-10 text-center text-sm italic text-slate-400">No conversation turns recorded.</p>
                )
              ) : (
                turns.map((t) => <ConversationTurn key={t.index} turn={t} />)
              )}
            </div>
          </div>

          {/* ── Right: AI Evaluation ── */}
          <div className="flex flex-col min-h-0 bg-white">
            <div className="flex-shrink-0 border-b border-slate-100 px-4 py-3">
              <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">AI Evaluation</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">

              {/* Score header */}
              <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-r from-slate-50 to-blue-50/50 p-4">
                <div className="text-center">
                  <div className={`text-3xl font-semibold leading-none tracking-tight ${scoreColor(aiScore)}`}>{aiScore.toFixed(1)}</div>
                  <div className="text-xs text-slate-400 mt-0.5">/10</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${review.evalResult.passed ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/70' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200/70'}`}>
                      <span className={`inline-flex items-center gap-1 ${review.evalResult.passed ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {review.evalResult.passed
                          ? <RunPassIcon className="h-3.5 w-3.5" aria-hidden="true" />
                          : <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                        {review.evalResult.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </span>
                    {review.evalResult.scenarioType && (
                      <span className="text-xs text-slate-600 bg-white px-2.5 py-1 rounded-full capitalize ring-1 ring-slate-200">
                        {review.evalResult.scenarioType}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{review.evalResult.summary}</p>
                </div>
              </div>

              {/* Recommendation / overall reasoning */}
              {review.evalResult.recommendation && (
                <div className="rounded-2xl border border-indigo-200/70 bg-indigo-50/80 p-4">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <RunAgentIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-700">AI Reasoning</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-indigo-950">
                    {review.evalResult.recommendation}
                  </p>
                </div>
              )}

              {/* Dimension scores */}
              {dimIds.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Dimension Scores
                    </span>
                    <button
                      onClick={() => toggleAllDims(dimIds)}
                      className="text-xs font-medium text-slate-500 hover:text-slate-700"
                    >
                      {allDimsExpanded ? 'Collapse all' : 'Expand all'}
                    </button>
                  </div>
                  <div className="space-y-2">
                    {dimIds.map((dimId) => {
                      const ds = dimScores[dimId]!;
                      const isOpen = expandedDims.has(dimId);
                      return (
                        <div key={dimId} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
                          <button
                            className="flex w-full items-center gap-2 border-b border-slate-100/80 bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/80"
                            onClick={() => toggleDim(dimId)}
                          >
                            <span className="text-xs">{isOpen ? '▾' : '▸'}</span>
                            <span className="flex-1 text-sm font-medium capitalize text-slate-800">
                              {dimId.replace(/_/g, ' ')}
                            </span>
                            <div className="w-24 flex-shrink-0">
                              <ScoreBar score={ds.score} />
                            </div>
                          </button>
                          {isOpen && (
                            <div className="space-y-2 px-3 py-2.5">
                              {ds.justification && (
                                <p className="text-xs leading-relaxed text-slate-700">{ds.justification}</p>
                              )}
                              {ds.evidence && (
                                <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-2.5 py-2">
                                  <div className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">Evidence</div>
                                  <p className="whitespace-pre-wrap text-xs leading-relaxed italic text-slate-600">{ds.evidence}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Review form footer ── */}
        <div className="flex-shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          {review && (review.status === 'approved' || review.status === 'overridden' || review.status === 'rejected') ? (
            /* ── View-only footer for terminal states ── */
            <div className="space-y-2">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Review</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Status</p>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusColor(review.status)}`}>
                    {review.status.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Score</p>
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {review.scoreOverride !== null ? review.scoreOverride.toFixed(1) : `${review.evalResult.overallScore.toFixed(1)} (AI)`}
                  </span>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Reviewer</p>
                  <span className="text-sm text-slate-700">{review.reviewer?.username ?? '—'}</span>
                </div>
              </div>
              {review.notes && (
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-500">Notes</p>
                  <p className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-700">{review.notes}</p>
                </div>
              )}
              <div className="flex justify-end pt-0.5">
                <button
                  onClick={onClose}
                  className="btn-secondary px-5 py-2"
                >
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* ── Editable footer for pending / in_review ── */
            <>
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Your Review</div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {/* Status */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Status</label>
                  <select
                    className="h-11"
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value as ReviewStatus)}
                  >
                    <option value="in_review">In Review (not finalised)</option>
                    <option value="approved">Approved (AI correct)</option>
                    <option value="overridden">Overridden (human score)</option>
                    <option value="rejected">Rejected (exclude from calibration)</option>
                  </select>
                </div>

                {/* Score override */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Score override <span className="text-slate-400 font-normal">(AI: {aiScore.toFixed(1)})</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    placeholder="Leave empty to use AI score"
                    className="h-11"
                    value={scoreDraft}
                    onChange={(e) => setScoreDraft(e.target.value)}
                  />
                </div>

                {/* Verdict */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">Verdict</label>
                  <select
                    className="h-11"
                    value={passDraft}
                    onChange={(e) => setPassDraft(e.target.value)}
                  >
                    <option value="">Use AI verdict</option>
                    <option value="pass">Pass</option>
                    <option value="fail">Fail</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Notes</label>
                <textarea
                  rows={2}
                  className="resize-none"
                  placeholder="Reviewer notes (optional)…"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                />
              </div>

              {saveError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{saveError}</p>}

              <div className="flex justify-end gap-2 pt-0.5">
                <button
                  onClick={onClose}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { void handleSave(); }}
                  disabled={saving}
                  className="btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save Review'}
                </button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── ReviewQueuePage ───────────────────────────────────────────────────────────

export function ReviewQueuePage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const LIMIT = 25;

  const load = useCallback(async (pg: number, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (status) params.set('status', status);
      const data = await apiFetch(`/api/reviews?${params.toString()}`) as {
        reviews: Review[];
        total: number;
        page: number;
      };
      setReviews(data.reviews);
      setTotal(data.total);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(page, statusFilter);
  }, [load, page, statusFilter]);

  function handleFilterChange(status: string) {
    setStatusFilter(status);
    setPage(1);
  }

  async function handleDelete(reviewId: string) {
    if (!confirm('Remove this review from the queue?')) return;
    setDeletingId(reviewId);
    try {
      await apiFetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
      void load(page, statusFilter);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Calibration review</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Review Queue</h2>
          <p className="text-sm leading-6 text-slate-200/80">
            Approve, override, or reject judge outputs with a clean calibration workflow.
          </p>
        </div>
      </section>

      {/* Calibration summary */}
      <CalibrationPanel />

      {/* Filter bar */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
            <p className="text-xs text-slate-500">Focus the queue by review status.</p>
          </div>
          <span className="text-xs uppercase tracking-[0.24em] text-slate-400">{total} total</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Filter:</span>
          {['', 'pending', 'in_review', 'approved', 'overridden', 'rejected'].map((s) => (
            <button
              key={s || 'all'}
              onClick={() => handleFilterChange(s)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s ? s.replace('_', ' ') : 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading review queue…</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {statusFilter ? `No ${statusFilter.replace('_', ' ')} reviews` : 'No reviews in queue yet'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Scenario</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AI Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Human</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Reviewer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Queued</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-slate-100/80 transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-700 max-w-xs truncate">
                    {r.run?.scenarioName ?? r.runId.slice(0, 8) + '…'}
                    {r.evalResult.scenarioType && (
                      <span className="ml-1.5 text-xs text-slate-400 capitalize">({r.evalResult.scenarioType})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-semibold tracking-tight ${scoreColor(r.evalResult.overallScore)}`}>
                      {r.evalResult.overallScore.toFixed(1)}
                    </span>
                    <span className={`ml-1.5 text-xs font-semibold ${r.evalResult.passed ? 'text-green-600' : 'text-red-500'}`}>
                      {r.evalResult.passed
                        ? <RunPassIcon className="h-3.5 w-3.5" aria-hidden="true" />
                        : <RunFailIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {r.scoreOverride !== null ? (
                      <span className={`font-mono font-semibold ${scoreColor(r.scoreOverride)}`}>
                        {r.scoreOverride.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(r.status)}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {r.reviewer?.username ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {fmtDate(r.queuedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setSelectedReviewId(r.id)}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                          r.status === 'approved' || r.status === 'overridden' || r.status === 'rejected'
                            ? 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200/70'
                        }`}
                      >
                        {r.status === 'approved' || r.status === 'overridden' || r.status === 'rejected' ? 'View' : 'Review'}
                      </button>
                      {r.status !== 'approved' && r.status !== 'overridden' && r.status !== 'rejected' && (
                        <button
                          onClick={() => { void handleDelete(r.id); }}
                          disabled={deletingId === r.id}
                          className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-40"
                          title="Remove from queue"
                        >
                          <RunFailIcon className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary px-3 py-2 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm font-medium text-slate-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary px-3 py-2 disabled:opacity-40"
          >
            →
          </button>
        </div>
      )}

      {/* Detail modal */}
      {selectedReviewId && (
        <ReviewDetailPanel
          reviewId={selectedReviewId}
          onClose={() => setSelectedReviewId(null)}
          onUpdated={() => { void load(page, statusFilter); }}
        />
      )}
    </div>
  );
}
