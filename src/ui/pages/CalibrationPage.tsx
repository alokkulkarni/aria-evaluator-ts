import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../lib/api.js';

interface JudgeCalibration {
  id: string;
  judgeProvider: string;
  judgeModelId: string;
  dimensionId: string | null;
  sampleCount: number;
  weightedKappa: number;
  binaryKappa: number | null;
  withinOneRate: number;
  exactAgreement: number;
  meanAbsError: number;
  trust: string;
}

interface CalibrationDataset {
  id: string;
  name: string;
  source: string;
  createdAt: string;
}

interface CalibrationData {
  calibrations: JudgeCalibration[];
  labelCount: number;
  datasets: CalibrationDataset[];
}

function trustBadge(trust: string): string {
  switch (trust) {
    case 'trusted': return 'bg-green-50 text-green-700 ring-1 ring-green-200';
    case 'supplementary': return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    case 'blocked': return 'bg-red-50 text-red-700 ring-1 ring-red-200';
    default: return 'bg-slate-100 text-slate-500 ring-1 ring-slate-200';
  }
}

interface PairwiseCalibration {
  id: string;
  judgeProvider: string;
  judgeModelId: string;
  datasetId: string;
  sampleCount: number;
  agreementAccuracy: number;
  binaryKappa: number;
  tieRate: number;
}
interface PairwiseDataset { id: string; name: string; source: string; createdAt: string }
interface PairwiseData { pairwise: PairwiseCalibration[]; datasets: PairwiseDataset[] }

// Pairwise benchmark (LMSYS Chatbot Arena) — judge A-vs-B agreement with human votes.
function PairwiseSection() {
  const [data, setData] = useState<PairwiseData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiFetch('/api/calibration/pairwise') as PairwiseData); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(datasetId: string) {
    setBusy(true); setErr(null); setNote(null);
    try {
      await apiFetch('/api/calibration/pairwise/run', { method: 'POST', body: JSON.stringify({ datasetId }) });
      setNote('Pairwise calibration started — judges are scoring each pair in the background. Refresh in a minute.');
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const datasets = data?.datasets ?? [];
  const rows = data?.pairwise ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Pairwise benchmark — LMSYS Chatbot Arena</h2>
          <p className="mt-1 text-xs text-slate-500">
            How often each judge&apos;s A-vs-B preference matches the human vote on an external pairwise dataset —
            separate from the per-dimension κ above. Import a sample with
            {' '}<code className="font-mono">scripts/load-lmsys-arena.ts</code>.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
          Refresh
        </button>
      </div>

      {err && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">{err}</p>}
      {note && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700 ring-1 ring-green-200">{note}</p>}

      {datasets.length === 0 ? (
        <p className="text-sm text-slate-400">
          No pairwise datasets yet. Run <code className="font-mono">npx tsx scripts/load-lmsys-arena.ts --limit 200</code> to import a sample, then click Run.
        </p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {datasets.map((d) => (
            <button key={d.id} type="button" disabled={busy} onClick={() => void run(d.id)}
              className="rounded-full bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
              Run pairwise calibration · {d.name}
            </button>
          ))}
        </div>
      )}

      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
              <th className="px-2 py-2">Judge</th><th className="px-2 py-2">Provider</th>
              <th className="px-2 py-2">Samples</th><th className="px-2 py-2">Agreement</th>
              <th className="px-2 py-2">Binary κ</th><th className="px-2 py-2">Tie rate</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-50">
                <td className="px-2 py-2 font-medium text-slate-700">{c.judgeModelId}</td>
                <td className="px-2 py-2 text-slate-500">{c.judgeProvider}</td>
                <td className="px-2 py-2 text-slate-600">{c.sampleCount}</td>
                <td className="px-2 py-2 font-mono">{(c.agreementAccuracy * 100).toFixed(0)}%</td>
                <td className="px-2 py-2 font-mono">{c.binaryKappa.toFixed(3)}</td>
                <td className="px-2 py-2">{(c.tieRate * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function CalibrationPage() {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Manual labeling form
  const [runId, setRunId] = useState('');
  const [dimensionId, setDimensionId] = useState('');
  const [humanScore, setHumanScore] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await apiFetch('/api/calibration') as CalibrationData);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function recompute() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const r = await apiFetch('/api/calibration/recompute', { method: 'POST', body: JSON.stringify({}) }) as { judges: number; samples: number };
      setMsg(`Recomputed ${r.judges} judge×dimension rows from ${r.samples} paired samples.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addLabel(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await apiFetch('/api/calibration/labels', {
        method: 'POST',
        body: JSON.stringify({ runId: runId.trim(), dimensionId: dimensionId.trim(), humanScore: Number(humanScore) }),
      });
      setMsg('Label saved.');
      setRunId(''); setDimensionId(''); setHumanScore('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const overall = (data?.calibrations ?? []).filter((c) => c.dimensionId === null);
  const perDim = (data?.calibrations ?? []).filter((c) => c.dimensionId !== null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Judge Calibration</h1>
          <p className="text-sm text-slate-500">
            Per-judge agreement with human ground truth (quadratic-weighted Cohen&apos;s κ). Labels come from
            review overrides, imports, and manual labeling. {data ? `${data.labelCount} labels.` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={recompute}
          disabled={busy}
          className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Recompute κ'}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {msg && <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700 ring-1 ring-green-200">{msg}</p>}

      {/* Overall per-judge */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Overall by judge</h2>
        {overall.length === 0 ? (
          <p className="text-sm text-slate-400">No calibration yet. Add labels, then Recompute κ.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-2">Judge</th><th className="px-2 py-2">Provider</th>
                <th className="px-2 py-2">Samples</th><th className="px-2 py-2">Weighted κ</th>
                <th className="px-2 py-2">Within ±1</th><th className="px-2 py-2">MAE</th><th className="px-2 py-2">Trust</th>
              </tr>
            </thead>
            <tbody>
              {overall.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-700">{c.judgeModelId}</td>
                  <td className="px-2 py-2 text-slate-500">{c.judgeProvider}</td>
                  <td className="px-2 py-2 text-slate-600">{c.sampleCount}</td>
                  <td className="px-2 py-2 font-mono">{c.weightedKappa.toFixed(3)}</td>
                  <td className="px-2 py-2">{(c.withinOneRate * 100).toFixed(0)}%</td>
                  <td className="px-2 py-2">{c.meanAbsError.toFixed(2)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${trustBadge(c.trust)}`}>{c.trust}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Per dimension */}
      {perDim.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">By judge × dimension</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-400">
                <th className="px-2 py-2">Judge</th><th className="px-2 py-2">Dimension</th>
                <th className="px-2 py-2">Samples</th><th className="px-2 py-2">Weighted κ</th><th className="px-2 py-2">Trust</th>
              </tr>
            </thead>
            <tbody>
              {perDim.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-2 py-2 font-medium text-slate-700">{c.judgeModelId}</td>
                  <td className="px-2 py-2 capitalize text-slate-600">{c.dimensionId?.replace(/_/g, ' ')}</td>
                  <td className="px-2 py-2 text-slate-600">{c.sampleCount}</td>
                  <td className="px-2 py-2 font-mono">{c.weightedKappa.toFixed(3)}</td>
                  <td className="px-2 py-2"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${trustBadge(c.trust)}`}>{c.trust}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Pairwise benchmark (LMSYS Chatbot Arena) */}
      <PairwiseSection />

      {/* Manual labeling */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Add a label</h2>
        <p className="mb-3 text-xs text-slate-500">
          Record the human ground-truth score for a run&apos;s dimension. It is compared against the judge votes
          stored on that run. (Reviews you approve/override also create labels automatically.)
        </p>
        <form onSubmit={addLabel} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Run ID
            <input value={runId} onChange={(e) => setRunId(e.target.value)} required className="w-64" placeholder="run id" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Dimension ID
            <input value={dimensionId} onChange={(e) => setDimensionId(e.target.value)} required className="w-56" placeholder="e.g. correctness" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-slate-600">
            Human score (0–10)
            <input type="number" min="0" max="10" step="0.5" value={humanScore} onChange={(e) => setHumanScore(e.target.value)} required className="w-32" />
          </label>
          <button type="submit" disabled={busy} className="rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
            Save label
          </button>
        </form>
      </section>
    </div>
  );
}
