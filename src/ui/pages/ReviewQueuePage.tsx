// src/ui/pages/ReviewQueuePage.tsx
// Judge calibration — review queue, score override, and calibration summary.

import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

// ─── Types ────────────────────────────────────────────────────────────────────

type ReviewStatus = 'pending' | 'in_review' | 'approved' | 'overridden' | 'rejected';

interface EvalResultSummary {
  id: string;
  overallScore: number;
  passed: boolean;
  summary: string;
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

interface Turn {
  index: number;
  role: string;
  content: string;
}

interface ReviewDetail extends Review {
  run?: RunSummary & { turns?: Turn[] };
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
    case 'pending':    return 'bg-yellow-100 text-yellow-800';
    case 'in_review':  return 'bg-blue-100 text-blue-800';
    case 'approved':   return 'bg-green-100 text-green-800';
    case 'overridden': return 'bg-orange-100 text-orange-800';
    case 'rejected':   return 'bg-red-100 text-red-800';
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
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Calibration Summary</h2>

      {/* Counts by status */}
      <div className="grid grid-cols-5 gap-2 text-center">
        {(['pending', 'in_review', 'approved', 'overridden', 'rejected'] as ReviewStatus[]).map((s) => (
          <div key={s} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
            <div className="text-lg font-bold text-slate-800">{summary.byStatus[s] ?? 0}</div>
            <div className="text-xs text-slate-500 capitalize">{s.replace('_', ' ')}</div>
          </div>
        ))}
      </div>

      {/* Agreement metrics */}
      {summary.completedCount > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
            <div className="text-lg font-bold text-slate-700">
              {summary.agreementRate !== null ? `${Math.round(summary.agreementRate * 100)}%` : '—'}
            </div>
            <div className="text-xs text-slate-500">Agreement rate</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
            <div className={`text-lg font-bold ${summary.avgAiScore !== null ? scoreColor(summary.avgAiScore) : 'text-slate-400'}`}>
              {summary.avgAiScore !== null ? `${summary.avgAiScore}/10` : '—'}
            </div>
            <div className="text-xs text-slate-500">Avg AI score</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
            <div className={`text-lg font-bold ${summary.avgHumanScore !== null ? scoreColor(summary.avgHumanScore) : 'text-slate-400'}`}>
              {summary.avgHumanScore !== null ? `${summary.avgHumanScore}/10` : '—'}
            </div>
            <div className="text-xs text-slate-500">Avg human score</div>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
            <div className="text-lg font-bold text-slate-700">
              {summary.avgDisagreement !== null ? `${summary.avgDisagreement}/10` : '—'}
            </div>
            <div className="text-xs text-slate-500">Avg disagreement</div>
          </div>
        </div>
      )}

      {/* Top disagreement dimensions */}
      {topDisagreements.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Top dimension disagreements</div>
          <div className="space-y-1">
            {topDisagreements.map(([dimId, stats]) => (
              <div key={dimId} className="flex items-center gap-2 text-sm">
                <span className="flex-1 font-medium text-slate-700">{dimId.replace(/_/g, ' ')}</span>
                <span className="text-slate-500 text-xs">AI: {stats.aiAvg.toFixed(1)}</span>
                <span className="text-slate-500 text-xs">Human: {stats.humanAvg.toFixed(1)}</span>
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

function ReviewDetailPanel({ reviewId, onClose, onUpdated }: ReviewDetailPanelProps) {
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusDraft, setStatusDraft] = useState<ReviewStatus>('pending');
  const [scoreDraft, setScoreDraft] = useState<string>('');
  const [passDraft, setPassDraft] = useState<string>('');
  const [notesDraft, setNotesDraft] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const data = await apiFetch(`/api/reviews/${reviewId}`) as { review: ReviewDetail; run?: RunSummary & { turns?: Turn[] } };
        const r = { ...data.review, run: data.run ?? data.review.run };
        setReview(r);
        setStatusDraft(r.status);
        setScoreDraft(r.scoreOverride !== null ? String(r.scoreOverride) : '');
        setPassDraft(r.passedOverride !== null ? (r.passedOverride ? 'pass' : 'fail') : '');
        setNotesDraft(r.notes ?? '');
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [reviewId]);

  const handleSave = useCallback(async () => {
    if (!review) return;
    setSaving(true);
    setError(null);
    try {
      const scoreNum = scoreDraft.trim() !== '' ? parseFloat(scoreDraft) : null;
      if (scoreNum !== null && (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 10)) {
        setError('Score override must be a number between 0 and 10');
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
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [review, statusDraft, scoreDraft, passDraft, notesDraft, onUpdated, onClose]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8 text-slate-600">Loading…</div>
      </div>
    );
  }

  if (!review || error) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white rounded-xl p-8">
          <p className="text-red-600">{error ?? 'Failed to load review'}</p>
          <button className="mt-3 text-sm text-slate-500 underline" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  const aiScore = review.evalResult.overallScore;
  const dimScores: Record<string, { score: number; justification: string; evidence?: string }> = (() => {
    try { return JSON.parse(review.evalResult.dimensionScores) as Record<string, { score: number; justification: string; evidence?: string }>; }
    catch { return {}; }
  })();

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-800">
              {review.run?.scenarioName ?? 'Review'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Run {review.runId.slice(0, 8)}… · Queued {fmtDate(review.queuedAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* AI score overview */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 flex items-start gap-4">
            <div className="text-center">
              <div className={`text-3xl font-bold ${scoreColor(aiScore)}`}>{aiScore.toFixed(1)}</div>
              <div className="text-xs text-slate-400">/10 AI</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${review.evalResult.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {review.evalResult.passed ? 'PASS' : 'FAIL'}
                </span>
                {review.evalResult.scenarioType && (
                  <span className="text-xs text-slate-500 capitalize">{review.evalResult.scenarioType}</span>
                )}
              </div>
              <p className="text-sm text-slate-600">{review.evalResult.summary}</p>
            </div>
          </div>

          {/* Dimension scores */}
          {Object.keys(dimScores).length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Dimension Scores</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {Object.entries(dimScores).map(([dimId, ds]) => (
                  <div key={dimId} className="flex items-center gap-2 text-sm">
                    <span className={`font-mono font-bold w-8 text-right flex-shrink-0 ${scoreColor(ds.score)}`}>{ds.score}</span>
                    <span className="text-slate-600 flex-1 truncate">{dimId.replace(/_/g, ' ')}</span>
                    {ds.justification && (
                      <span className="text-xs text-slate-400 truncate max-w-xs" title={ds.justification}>{ds.justification.slice(0, 60)}…</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Conversation turns */}
          {review.run?.turns && review.run.turns.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Conversation</div>
              <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg bg-slate-50 border border-slate-100 p-3">
                {review.run.turns.map((t) => (
                  <div key={t.index} className={`text-sm ${t.role === 'agent' ? 'text-blue-700' : 'text-slate-700'}`}>
                    <span className="font-semibold capitalize">{t.role}: </span>
                    {t.content}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review form */}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <div className="text-xs font-semibold text-slate-500 uppercase">Review</div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 w-28 flex-shrink-0">Status</label>
              <select
                className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as ReviewStatus)}
              >
                <option value="pending">Pending</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved (AI correct)</option>
                <option value="overridden">Overridden (human score)</option>
                <option value="rejected">Rejected (exclude from calibration)</option>
              </select>
            </div>

            {/* Score override */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 w-28 flex-shrink-0">Score override</label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                placeholder={`AI: ${aiScore.toFixed(1)}`}
                className="w-28 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={scoreDraft}
                onChange={(e) => setScoreDraft(e.target.value)}
              />
              <span className="text-xs text-slate-400">0–10, leave empty to use AI score</span>
            </div>

            {/* Pass/fail override */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600 w-28 flex-shrink-0">Verdict</label>
              <select
                className="w-40 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={passDraft}
                onChange={(e) => setPassDraft(e.target.value)}
              >
                <option value="">Use AI verdict</option>
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
              </select>
            </div>

            {/* Notes */}
            <div className="flex items-start gap-3">
              <label className="text-sm font-medium text-slate-600 w-28 flex-shrink-0 pt-1.5">Notes</label>
              <textarea
                rows={3}
                className="flex-1 border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
                placeholder="Reviewer notes (optional)…"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-slate-500 hover:text-slate-700 rounded-md border border-slate-200 hover:border-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={() => { void handleSave(); }}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Review'}
          </button>
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
      {/* Calibration summary */}
      <CalibrationPanel />

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-600">Filter:</span>
        {['', 'pending', 'in_review', 'approved', 'overridden', 'rejected'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => handleFilterChange(s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">{total} total</span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading review queue…</div>
        ) : reviews.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            {statusFilter ? `No ${statusFilter.replace('_', ' ')} reviews` : 'No reviews in queue yet'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Scenario</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">AI Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Human</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Reviewer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Queued</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700 max-w-xs truncate">
                    {r.run?.scenarioName ?? r.runId.slice(0, 8) + '…'}
                    {r.evalResult.scenarioType && (
                      <span className="ml-1.5 text-xs text-slate-400 capitalize">({r.evalResult.scenarioType})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-mono font-semibold ${scoreColor(r.evalResult.overallScore)}`}>
                      {r.evalResult.overallScore.toFixed(1)}
                    </span>
                    <span className={`ml-1.5 text-xs font-semibold ${r.evalResult.passed ? 'text-green-600' : 'text-red-500'}`}>
                      {r.evalResult.passed ? '✓' : '✗'}
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
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                      >
                        Review
                      </button>
                      <button
                        onClick={() => { void handleDelete(r.id); }}
                        disabled={deletingId === r.id}
                        className="px-2 py-1 rounded-md text-xs font-medium text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                        title="Remove from queue"
                      >
                        ✕
                      </button>
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
            className="px-3 py-1 rounded-md text-sm border border-slate-200 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-sm text-slate-600">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded-md text-sm border border-slate-200 disabled:opacity-40"
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
