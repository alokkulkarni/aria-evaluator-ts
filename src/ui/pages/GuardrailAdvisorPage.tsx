import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { apiFetch, ApiError } from '../lib/api.js';

// Local view models mirroring the /api/guardrail-advisor responses (pages define
// their own interfaces in this codebase rather than importing server types).
type Severity = 'REQUIRED' | 'RECOMMENDED' | 'OPTIONAL';
type PlatformId = 'bedrock' | 'langchain' | 'copilot' | 'foundry' | 'strands';

interface SubFunction {
  id: string;
  label: string;
}
interface Domain {
  id: string;
  label: string;
  subFunctions: SubFunction[];
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
}
interface FormattedConfig {
  guardrailId: string;
  config: string;
  language: string;
  sourceDocUrls: string[];
  docsFreshAsOf: string;
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

  // Step 2
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  // Step 3
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [platform, setPlatform] = useState<PlatformId>('bedrock');

  // Step 4
  const [configs, setConfigs] = useState<FormattedConfig[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [openConfigId, setOpenConfigId] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/guardrail-advisor/domains')
      .then((data) => setDomains((data as { domains: Domain[] }).domains ?? []))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  const selectedDomain = useMemo(
    () => domains.find((d) => d.id === domainId) ?? null,
    [domains, domainId],
  );

  const grouped = useMemo(() => {
    return SEVERITY_ORDER.map((severity) => ({
      severity,
      items: recommendations.filter((r) => r.severity === severity),
    })).filter((g) => g.items.length > 0);
  }, [recommendations]);

  const startSession = useCallback(async () => {
    if (!domainId || !subFunctionId) return;
    setBusy(true);
    setError(null);
    try {
      const data = (await apiFetch('/api/guardrail-advisor/sessions', {
        method: 'POST',
        body: JSON.stringify({ domain: domainId, subFunction: subFunctionId }),
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
  }, [domainId, subFunctionId]);

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
    setSessionId(null);
    setQuestions([]);
    setAnswers({});
    setRecommendations([]);
    setConfigs([]);
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
            {domains.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setDomainId(d.id);
                  setSubFunctionId(null);
                }}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  domainId === d.id
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/40'
                    : 'border-slate-200/80 bg-white hover:shadow-md'
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">{d.label}</div>
                <div className="mt-1 text-xs text-slate-500">{d.subFunctions.length} functions</div>
              </button>
            ))}
          </div>

          {selectedDomain && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-slate-700">Function</h4>
              <div className="flex flex-wrap gap-2">
                {selectedDomain.subFunctions.map((sf) => (
                  <button
                    key={sf.id}
                    type="button"
                    onClick={() => setSubFunctionId(sf.id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      subFunctionId === sf.id
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {sf.label}
                  </button>
                ))}
              </div>
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
          <div className="card flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">
                {PLATFORMS.find((p) => p.id === platform)?.label ?? platform} configs
              </h3>
              <p className="text-sm text-slate-500">{configs.length} generated.</p>
            </div>
            <button type="button" className="btn-secondary px-4 py-2 text-sm" onClick={startOver}>
              Start over
            </button>
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
