import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch, ApiError } from '../lib/api.js';

// Local view models mirroring the /api/guardrail-advisor responses (pages define
// their own interfaces in this codebase rather than importing server types).
type Severity = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
type PlatformId = 'bedrock' | 'langchain' | 'copilot' | 'foundry' | 'strands';

interface SubFunction {
  id: string;
  label: string;
  // User-defined (custom) function: carries a free-text description threaded to the LLM.
  custom?: boolean;
  description?: string;
}
interface Domain {
  id: string;
  label: string;
  subFunctions: SubFunction[];
  custom?: boolean;
  description?: string;
}
interface QuestionOption {
  value: string;
  label: string;
}
interface ClarifyingQuestion {
  id: string;
  text: string;
  type: 'single-choice' | 'multi-choice' | 'text';
  options?: QuestionOption[];
}
interface Recommendation {
  id: string;
  guardrailType: string;
  severity: Severity;
  title: string;
  rationale: string;
  regulations: string[];
  source?: 'curated' | 'ai-suggested';
}
interface FormattedConfig {
  guardrailId: string;
  config: string;
  language: string;
  sourceDocUrls: string[];
  docsFreshAsOf: string;
}
interface CitationVerdict {
  citation: string;
  status: 'verified' | 'corrected' | 'not-found' | 'unverified';
  sourceUrl?: string;
  correctedCitation?: string;
  note?: string;
}
interface VerifyState {
  loading: boolean;
  results?: CitationVerdict[];
  error?: string;
}

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'bedrock', label: 'AWS Bedrock Guardrails' },
  { id: 'langchain', label: 'LangChain (Python)' },
  { id: 'copilot', label: 'Microsoft Copilot Studio' },
  { id: 'foundry', label: 'Azure AI Foundry' },
  { id: 'strands', label: 'AWS Strands Agents' },
];

const SEVERITY_ORDER: Severity[] = ['REQUIRED', 'RECOMMENDED', 'OPTIONAL'];

function severityBadgeClass(s: Severity): string {
  if (s === 'REQUIRED') return 'bg-red-50 text-red-700 ring-1 ring-red-200/70';
  if (s === 'RECOMMENDED') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200/70';
  return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200/70';
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.error ?? err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}

const STEP_LABELS = ['Domain', 'Questions', 'Recommendations', 'Configs'];

export function GuardrailAdvisorPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [subFunctionId, setSubFunctionId] = useState<string | null>(null);
  // User-defined (custom) entries, held client-side for this session only. Custom
  // functions are keyed by the domain they belong to (curated or custom).
  const [customDomains, setCustomDomains] = useState<Domain[]>([]);
  const [customFunctions, setCustomFunctions] = useState<Record<string, SubFunction[]>>({});
  const [showDomainForm, setShowDomainForm] = useState(false);
  const [domainDraftLabel, setDomainDraftLabel] = useState('');
  const [domainDraftDesc, setDomainDraftDesc] = useState('');
  const [showFunctionForm, setShowFunctionForm] = useState(false);
  const [functionDraftLabel, setFunctionDraftLabel] = useState('');
  const [functionDraftDesc, setFunctionDraftDesc] = useState('');

  // Step 2
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Step 3
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [platform, setPlatform] = useState<PlatformId>('bedrock');
  // True when the chosen domain or function was user-defined — there's no curated
  // baseline, so the whole recommendation set is AI-generated (flagged in the UI).
  const [customSession, setCustomSession] = useState(false);

  // Step 4
  const [configs, setConfigs] = useState<FormattedConfig[]>([]);
  // The platform the currently-shown configs were generated for (may differ from
  // `platform` once the user picks a new one to regenerate).
  const [configsPlatform, setConfigsPlatform] = useState<PlatformId | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openConfigId, setOpenConfigId] = useState<string | null>(null);

  // Per-AI-guardrail citation verification (keyed by guardrail id).
  const [verifications, setVerifications] = useState<Record<string, VerifyState>>({});

  useEffect(() => {
    apiFetch('/api/guardrail-advisor/domains')
      .then((data) => setDomains((data as { domains: Domain[] }).domains ?? []))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  // Curated taxonomy + locally-added custom domains.
  const allDomains = useMemo(() => [...domains, ...customDomains], [domains, customDomains]);

  const selectedDomain = useMemo(
    () => allDomains.find((d) => d.id === domainId) ?? null,
    [allDomains, domainId],
  );

  // A domain's functions = its (curated) sub-functions plus any custom ones added to it.
  const functionCount = useCallback(
    (d: Domain) => d.subFunctions.length + (customFunctions[d.id]?.length ?? 0),
    [customFunctions],
  );
  const selectedFunctions = useMemo(
    () => (selectedDomain ? [...selectedDomain.subFunctions, ...(customFunctions[selectedDomain.id] ?? [])] : []),
    [selectedDomain, customFunctions],
  );

  // Curated (verified) guardrails grouped by severity; AI-suggested ones are shown
  // in their own clearly-labelled section so unverified citations are never mistaken
  // for the curated, verified ones.
  const grouped = useMemo(() => {
    const curated = recommendations.filter((r) => r.source !== 'ai-suggested');
    return SEVERITY_ORDER.map((severity) => ({
      severity,
      items: curated.filter((r) => r.severity === severity),
    })).filter((g) => g.items.length > 0);
  }, [recommendations]);

  const aiSuggested = useMemo(
    () => recommendations.filter((r) => r.source === 'ai-suggested'),
    [recommendations],
  );

  // AI-suggested guardrails grouped by severity too — for a custom domain this set is
  // the whole baseline, so ranking it REQUIRED → RECOMMENDED → OPTIONAL gives the same
  // hybrid layout as curated, while each card keeps its "verify citations" marker.
  const aiGrouped = useMemo(
    () =>
      SEVERITY_ORDER.map((severity) => ({
        severity,
        items: aiSuggested.filter((r) => r.severity === severity),
      })).filter((g) => g.items.length > 0),
    [aiSuggested],
  );

  // Slugify a label into a safe `custom-…` id. The prefix guarantees the id never
  // collides with a curated `domain:subFunction` knowledge-base key, and the result
  // matches the server's `^[a-z0-9-]+$` validation.
  const customSlug = (label: string): string => {
    const base = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);
    return `custom-${base || 'entry'}`;
  };

  const addCustomDomain = () => {
    const label = domainDraftLabel.trim();
    const description = domainDraftDesc.trim();
    if (!label || !description) return;
    const id = customSlug(label);
    setCustomDomains((prev) => [...prev.filter((d) => d.id !== id), { id, label, subFunctions: [], custom: true, description }]);
    setDomainId(id);
    setSubFunctionId(null);
    setShowDomainForm(false);
    setShowFunctionForm(false);
    setDomainDraftLabel('');
    setDomainDraftDesc('');
  };

  const addCustomFunction = () => {
    if (!domainId) return;
    const label = functionDraftLabel.trim();
    const description = functionDraftDesc.trim();
    if (!label || !description) return;
    const id = customSlug(label);
    setCustomFunctions((prev) => ({
      ...prev,
      [domainId]: [...(prev[domainId] ?? []).filter((f) => f.id !== id), { id, label, custom: true, description }],
    }));
    setSubFunctionId(id);
    setShowFunctionForm(false);
    setFunctionDraftLabel('');
    setFunctionDraftDesc('');
  };

  const startSession = useCallback(async () => {
    if (!domainId || !subFunctionId) return;
    setBusy(true);
    setError(null);
    try {
      const domain = allDomains.find((d) => d.id === domainId) ?? null;
      const fn = selectedFunctions.find((f) => f.id === subFunctionId) ?? null;
      setCustomSession(Boolean(domain?.custom || fn?.custom));
      const body: Record<string, string> = { domain: domainId, subFunction: subFunctionId };
      if (domain?.custom) {
        body.domainLabel = domain.label;
        if (domain.description) body.domainDescription = domain.description;
      }
      if (fn?.custom) {
        body.subFunctionLabel = fn.label;
        if (fn.description) body.subFunctionDescription = fn.description;
      }
      const data = (await apiFetch('/api/guardrail-advisor/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      })) as { sessionId: string; questions: ClarifyingQuestion[] };
      setSessionId(data.sessionId);
      setQuestions(data.questions ?? []);
      setAnswers({});
      setStep(2);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [domainId, subFunctionId, allDomains, selectedFunctions]);

  const getRecommendations = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await apiFetch(`/api/guardrail-advisor/sessions/${sessionId}/recommend`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      })) as { recommendations: Recommendation[] };
      setRecommendations(data.recommendations ?? []);
      setStep(3);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [sessionId, answers]);

  const generateConfigs = useCallback(async () => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await apiFetch(`/api/guardrail-advisor/sessions/${sessionId}/format`, {
        method: 'POST',
        body: JSON.stringify({ platform, guardrailIds: [] }),
      })) as { platform: string; configs: FormattedConfig[] };
      setConfigs(data.configs ?? []);
      setConfigsPlatform(platform);
      setOpenConfigId(data.configs?.[0]?.guardrailId ?? null);
      setStep(4);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [sessionId, platform]);

  const startOver = useCallback(() => {
    setStep(1);
    setError(null);
    setDomainId(null);
    setSubFunctionId(null);
    setCustomDomains([]);
    setCustomFunctions({});
    setShowDomainForm(false);
    setDomainDraftLabel('');
    setDomainDraftDesc('');
    setShowFunctionForm(false);
    setFunctionDraftLabel('');
    setFunctionDraftDesc('');
    setCustomSession(false);
    setSessionId(null);
    setQuestions([]);
    setAnswers({});
    setRecommendations([]);
    setConfigs([]);
    setConfigsPlatform(null);
    setOpenConfigId(null);
  }, []);

  const setSingleAnswer = (qid: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const toggleMultiAnswer = (qid: string, value: string) =>
    setAnswers((prev) => {
      const current = Array.isArray(prev[qid]) ? (prev[qid] as string[]) : [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [qid]: next };
    });

  const copyConfig = (cfg: FormattedConfig) => {
    navigator.clipboard
      .writeText(cfg.config)
      .then(() => {
        setCopiedId(cfg.guardrailId);
        window.setTimeout(() => setCopiedId(null), 1500);
      })
      .catch(() => {});
  };

  const verifyRecCitations = useCallback(
    async (rec: Recommendation) => {
      if (rec.regulations.length === 0) return;
      setVerifications((prev) => ({ ...prev, [rec.id]: { loading: true } }));
      try {
        const data = (await apiFetch('/api/guardrail-advisor/verify', {
          method: 'POST',
          body: JSON.stringify({
            citations: rec.regulations,
            context: `${domainId ?? ''}/${subFunctionId ?? ''} — ${rec.title}`.slice(0, 500),
          }),
        })) as { results: CitationVerdict[] };
        setVerifications((prev) => ({ ...prev, [rec.id]: { loading: false, results: data.results ?? [] } }));
      } catch (err) {
        setVerifications((prev) => ({ ...prev, [rec.id]: { loading: false, error: errorMessage(err) } }));
      }
    },
    [domainId, subFunctionId],
  );

  // One AI-suggested guardrail card (violet, dashed, with the citation-verification
  // affordance). Rendered inside each severity group so the AI baseline reads like the
  // curated core while staying clearly marked as unverified.
  const renderAiCard = (rec: Recommendation) => (
    <div key={rec.id} className="card space-y-2 border-dashed border-violet-200 bg-violet-50/30">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-900">{rec.title}</h4>
        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
          {rec.guardrailType}
        </span>
      </div>
      <p className="text-sm leading-6 text-slate-600">{rec.rationale}</p>
      {rec.regulations.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {!verifications[rec.id]?.results && (
              <span className="text-[11px] font-medium uppercase tracking-wide text-amber-600">
                Unverified basis:
              </span>
            )}
            {rec.regulations.map((reg) => {
              const verdict = verifications[rec.id]?.results?.find((v) => v.citation === reg);
              if (!verdict) {
                return (
                  <span
                    key={reg}
                    title="AI-suggested citation — verify before relying on it"
                    className="inline-flex items-center rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                  >
                    {reg}?
                  </span>
                );
              }
              const cls =
                verdict.status === 'verified'
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70'
                  : verdict.status === 'corrected'
                    ? 'bg-amber-50 text-amber-700 ring-amber-200/70'
                    : verdict.status === 'not-found'
                      ? 'bg-rose-50 text-rose-700 ring-rose-200/70'
                      : 'bg-slate-100 text-slate-600 ring-slate-200/70';
              const label =
                verdict.status === 'verified'
                  ? `${reg} ✓`
                  : verdict.status === 'corrected'
                    ? `${reg} → ${verdict.correctedCitation ?? 'see source'}`
                    : verdict.status === 'not-found'
                      ? `${reg} ✗ not found`
                      : `${reg} — unverified`;
              const pill = (
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cls}`}
                  title={verdict.note}
                >
                  {label}
                </span>
              );
              return verdict.sourceUrl ? (
                <a key={reg} href={verdict.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:opacity-80">
                  {pill}
                </a>
              ) : (
                <span key={reg}>{pill}</span>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50"
              disabled={verifications[rec.id]?.loading}
              onClick={() => verifyRecCitations(rec)}
            >
              {verifications[rec.id]?.loading
                ? 'Verifying…'
                : verifications[rec.id]?.results
                  ? 'Re-verify citations'
                  : 'Verify citations'}
            </button>
            {verifications[rec.id]?.error && (
              <span className="text-[11px] text-rose-600">{verifications[rec.id]?.error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Guardrail Advisor</p>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Recommend &amp; format AI guardrails
            </h2>
            <p className="text-sm leading-6 text-slate-200/80">
              Pick a domain, answer a few questions, and get severity-ranked guardrails with
              regulatory citations and copy-paste platform configs.
            </p>
          </div>
          <div className="text-right text-xs text-slate-200/80">
            Step {step} of 4 · {STEP_LABELS[step - 1]}
          </div>
        </div>
        <ol className="mt-5 flex flex-wrap gap-2">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4;
            const state = n === step ? 'current' : n < step ? 'done' : 'todo';
            return (
              <li
                key={label}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                  state === 'current'
                    ? 'bg-white text-slate-900'
                    : state === 'done'
                      ? 'bg-cyan-400/20 text-cyan-100'
                      : 'bg-white/10 text-slate-300'
                }`}
              >
                <span>{n}</span>
                {label}
              </li>
            );
          })}
        </ol>
      </section>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {/* ── Step 1: Domain selection ───────────────────────────────────────── */}
      {step === 1 && (
        <div className="card space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Choose a domain</h3>
            <p className="text-sm text-slate-500">Then pick the agent's function.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {allDomains.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDomainId(d.id);
                  setSubFunctionId(null);
                  setShowFunctionForm(false);
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  domainId === d.id
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/40'
                    : 'border-slate-200/80 bg-white hover:shadow-md'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{d.label}</span>
                  {d.custom && (
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200/70">
                      Custom
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-slate-500">{functionCount(d)} functions</div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowDomainForm((v) => !v)}
              className={`rounded-2xl border border-dashed px-4 py-4 text-left transition-all ${
                showDomainForm
                  ? 'border-violet-400 bg-violet-50/40'
                  : 'border-slate-300 bg-white hover:border-violet-300 hover:bg-violet-50/30'
              }`}
            >
              <div className="text-sm font-semibold text-violet-700">+ Add custom domain</div>
              <div className="mt-1 text-xs text-slate-500">Describe a domain not listed here</div>
            </button>
          </div>

          {showDomainForm && (
            <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Domain name</label>
                <input
                  type="text"
                  value={domainDraftLabel}
                  maxLength={80}
                  onChange={(e) => setDomainDraftLabel(e.target.value)}
                  placeholder="e.g. Education"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description <span className="font-normal text-slate-400">— what does this domain cover? (helps the AI)</span>
                </label>
                <textarea
                  value={domainDraftDesc}
                  maxLength={2000}
                  rows={3}
                  onChange={(e) => setDomainDraftDesc(e.target.value)}
                  placeholder="e.g. K-12 online learning platform serving students, parents and teachers across the EU."
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  onClick={() => setShowDomainForm(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  disabled={!domainDraftLabel.trim() || !domainDraftDesc.trim()}
                  onClick={addCustomDomain}
                >
                  Add domain
                </button>
              </div>
            </div>
          )}

          {selectedDomain && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Function</h4>
              <div className="flex flex-wrap gap-2">
                {selectedFunctions.map((sf) => (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => setSubFunctionId(sf.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      subFunctionId === sf.id
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sf.label}
                    {sf.custom && (
                      <span
                        className={`rounded-full px-1 text-[10px] font-semibold uppercase tracking-wide ${
                          subFunctionId === sf.id ? 'bg-white/25 text-white' : 'bg-violet-50 text-violet-700'
                        }`}
                      >
                        Custom
                      </span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowFunctionForm((v) => !v)}
                  className={`rounded-full border border-dashed px-3 py-1.5 text-sm font-medium transition-colors ${
                    showFunctionForm
                      ? 'border-violet-400 bg-violet-50/60 text-violet-700'
                      : 'border-slate-300 text-violet-700 hover:bg-violet-50/40'
                  }`}
                >
                  + Add custom function
                </button>
              </div>

              {showFunctionForm && (
                <div className="space-y-3 rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">Function name</label>
                    <input
                      type="text"
                      value={functionDraftLabel}
                      maxLength={80}
                      onChange={(e) => setFunctionDraftLabel(e.target.value)}
                      placeholder="e.g. AI Homework Tutor"
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Description <span className="font-normal text-slate-400">— what does this agent do? (helps the AI)</span>
                    </label>
                    <textarea
                      value={functionDraftDesc}
                      maxLength={2000}
                      rows={3}
                      onChange={(e) => setFunctionDraftDesc(e.target.value)}
                      placeholder="e.g. Helps students with maths homework, explains steps, never gives final exam answers."
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-violet-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-secondary px-3 py-1.5 text-xs"
                      onClick={() => setShowFunctionForm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn-primary px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      disabled={!functionDraftLabel.trim() || !functionDraftDesc.trim()}
                      onClick={addCustomFunction}
                    >
                      Add function
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={!domainId || !subFunctionId || busy}
              onClick={startSession}
            >
              {busy ? 'Starting…' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Clarifying questions ───────────────────────────────────── */}
      {step === 2 && (
        <div className="card space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Clarifying questions</h3>
            <p className="text-sm text-slate-500">
              These tailor the recommendations to your jurisdiction, users, and data.
            </p>
          </div>

          <div className="space-y-5">
            {questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <label className="block text-sm font-semibold text-slate-700">{q.text}</label>
                {q.type === 'text' ? (
                  <input
                    type="text"
                    value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
                    onChange={(e) => setSingleAnswer(q.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    placeholder="Type your answer…"
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(q.options ?? []).map((opt) => {
                      const selected =
                        q.type === 'multi-choice'
                          ? Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(opt.value)
                          : answers[q.id] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() =>
                            q.type === 'multi-choice'
                              ? toggleMultiAnswer(q.id, opt.value)
                              : setSingleAnswer(q.id, opt.value)
                          }
                          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                            selected
                              ? 'bg-blue-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setStep(1)}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy}
              onClick={getRecommendations}
            >
              {busy ? 'Working…' : 'Get Recommendations'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Recommendations ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Recommended guardrails</h3>
              <p className="text-sm text-slate-500">{recommendations.length} guardrails, ranked by severity.</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600" htmlFor="platform">
                Platform
              </label>
              <select
                id="platform"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformId)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {grouped.map((group) => (
            <div key={group.severity} className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityBadgeClass(group.severity)}`}
                >
                  {group.severity}
                </span>
                <span className="text-xs text-slate-500">{group.items.length}</span>
              </div>
              <div className="grid gap-3">
                {group.items.map((rec) => (
                  <div key={rec.id} className="card space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <h4 className="text-sm font-semibold text-slate-900">{rec.title}</h4>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        {rec.guardrailType}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-slate-600">{rec.rationale}</p>
                    {rec.regulations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {rec.regulations.map((reg) => (
                          <a
                            key={reg}
                            href={`https://www.google.com/search?q=${encodeURIComponent(reg)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-200"
                          >
                            {reg}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {aiSuggested.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 ring-1 ring-violet-200/70">
                    ✨ AI-SUGGESTED
                  </span>
                  <span className="text-xs text-amber-600">{aiSuggested.length} · verify citations before relying on these</span>
                </div>
                {customSession && (
                  <p className="rounded-lg bg-violet-50/60 px-3 py-2 text-xs leading-5 text-violet-900/80 ring-1 ring-violet-200/60">
                    <span className="font-semibold">Custom domain.</span> It isn't in our curated catalogue, so the
                    whole baseline below is AI-generated and ranked by severity. Treat the citations as unverified
                    until you check them.
                  </p>
                )}
              </div>
              {aiGrouped.map((group) => (
                <div key={group.severity} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${severityBadgeClass(group.severity)}`}
                    >
                      {group.severity}
                    </span>
                    <span className="text-xs text-slate-500">{group.items.length}</span>
                  </div>
                  <div className="grid gap-3">{group.items.map(renderAiCard)}</div>
                </div>
              ))}
            </div>
          )}

          {recommendations.length === 0 && (
            <div className="card border-dashed text-center">
              <p className="text-sm font-semibold text-slate-700">No recommendations were generated.</p>
              <p className="mt-1 text-sm text-slate-500">
                For a custom domain the recommendations come from the AI suggester, which can return
                nothing if it timed out or is disabled. Go back and try again, or refine the description.
              </p>
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              type="button"
              className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={busy || recommendations.length === 0}
              onClick={generateConfigs}
            >
              {busy
                ? 'Generating…'
                : `Generate Configs for ${PLATFORMS.find((p) => p.id === platform)?.label ?? platform}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Formatted configs ──────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-5">
          <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {PLATFORMS.find((p) => p.id === (configsPlatform ?? platform))?.label ?? platform} configs
              </h3>
              <p className="text-sm text-slate-500">
                {configs.length} generated. Switch platform to regenerate for the same guardrails.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="platform-step4">
                Platform
              </label>
              <select
                id="platform-step4"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformId)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy || platform === configsPlatform}
                onClick={generateConfigs}
              >
                {busy ? 'Generating…' : 'Regenerate'}
              </button>
              <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={() => setStep(3)}>
                Back
              </button>
              <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={startOver}>
                Start over
              </button>
            </div>
          </div>

          {configs.map((cfg) => {
            const open = openConfigId === cfg.guardrailId;
            return (
              <div key={cfg.guardrailId} className="card space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-sm font-semibold text-slate-900"
                    onClick={() => setOpenConfigId(open ? null : cfg.guardrailId)}
                  >
                    <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                    {cfg.guardrailId}
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                      {cfg.language}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => copyConfig(cfg)}
                  >
                    {copiedId === cfg.guardrailId ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {open && (
                  <>
                    <pre className="overflow-x-auto rounded-xl bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100">
                      <code>{cfg.config}</code>
                    </pre>
                    <p className="text-[11px] text-slate-500">
                      {cfg.sourceDocUrls.length > 0 ? (
                        <>
                          Generated from{' '}
                          {cfg.sourceDocUrls.map((url, i) => (
                            <React.Fragment key={url}>
                              {i > 0 && ', '}
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline"
                              >
                                {new URL(url).hostname}
                              </a>
                            </React.Fragment>
                          ))}{' '}
                          ·{' '}
                        </>
                      ) : null}
                      Docs as of {new Date(cfg.docsFreshAsOf).toLocaleDateString()}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
