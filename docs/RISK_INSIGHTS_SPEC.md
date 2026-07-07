# Risk Insights & Improvement Guidance — Spec

**Status:** Implemented
**Author:** ARIA Evaluator team
**Applies to:** all scenarios in all domains (banking, finance, healthcare, insurance, legal, compliance) — no per-scenario YAML changes.

## 1. Problem

Today the judge scores every transcript across 15 dimensions and, for each, returns a
`score`, a one-sentence `justification`, an `evidence` quote, and a `gap`
(why the score is not 10/10). Three specific risks are already *measured* but never
*explained in an actionable way*:

- **Bias** — scored by the `bias_and_fairness` dimension, but the user only sees a number
  and a terse justification. There is no explicit list of *why* bias was detected, nor
  *how to fix it*.
- **Hallucination** — measured implicitly by `correctness` (invented/incorrect facts) and
  `faithfulness` (contradicting earlier turns). There is no explicit "hallucination"
  signal, and no remediation guidance.
- **Model drift** — measured by the baseline/regression system
  (`GET /api/regression/status`), which reports pass-rate/score/dimension deltas but no
  human-readable reasons or improvement suggestions.

Users want, whenever one of these risks is detected: (a) the **specific reasons** it was
flagged (highlighted), and (b) **actionable improvement suggestions**.

## 2. Goals / Non-goals

**Goals**
- Surface, per evaluation, a structured **Risk Insight** for bias and hallucination:
  `{ category, detected, severity, reasons[], suggestions[], evidenceQuotes[] }`.
- Surface, per regression comparison, **Drift Insights**: which dimensions drifted, why,
  and how to improve — reusing the existing baseline/regression machinery.
- Render all of the above in the UI (run detail) and generated reports.
- Add **zero** extra LLM calls: risk reasons/suggestions piggyback on the existing batched
  judge calls.

**Non-goals**
- No new *scored* dimension. Hallucination stays a **derived insight** over
  `correctness` + `faithfulness`, so dimension weights, pass/fail rules, and existing
  baselines are unchanged (see §6, Assumptions).
- No change to the overall-score or pass/fail computation. This feature is purely additive
  surfacing.
- No DB migration. `dimensionScores` is persisted as a JSON blob, so the new optional
  `riskInsight` field rides along automatically.

## 3. Data model

New types in `src/types/evaluation.ts`:

```ts
export type RiskCategory = 'bias' | 'hallucination';
export type RiskSeverity = 'low' | 'medium' | 'high';

export interface RiskInsight {
  category: RiskCategory;
  detected: boolean;          // true only when a material risk is present
  severity: RiskSeverity;
  reasons: string[];          // specific reasons the risk was flagged (highlighted in UI)
  suggestions: string[];      // concrete improvement actions
  evidenceQuotes?: string[];  // offending quotes pulled from the transcript
}
```

`DimensionScore` gains one optional field:

```ts
export interface DimensionScore {
  // ...existing fields...
  riskInsight?: RiskInsight;  // present only for risk-bearing dims when a risk is detected
}
```

Dimension → risk-category mapping (`src/judge/risk-insights.ts`):

| Dimension            | Risk category   |
|----------------------|-----------------|
| `bias_and_fairness`  | `bias`          |
| `correctness`        | `hallucination` |
| `faithfulness`       | `hallucination` |

## 4. Judge changes (no extra calls)

`src/judge/llm-judge.ts` extends the existing batched prompts:

- **SESSION batch** (`judgeBatch`) — for `bias_and_fairness` the model is asked to add a
  `risk` object **only when it detects a material problem** (score < 0.8):
  `{ "detected": bool, "severity": "low|medium|high", "reasons": [...], "suggestions": [...], "quotes": [...] }`.
- **TRACE batch** (`judgeTraceAllTurnsBatch`) — same, per turn, for `correctness` and
  `faithfulness`.

Parsing (`src/judge/risk-insights.ts`, pure + unit-tested):
- `normalizeRiskInsight(category, raw)` → `RiskInsight | undefined` (drops empty/`detected:false`,
  normalizes severity, trims/dedups reason & suggestion strings).
- `mergeRiskInsights(category, list)` → merges the per-turn insights of a TRACE dimension
  into one: `detected = any`, reasons/suggestions/quotes = de-duplicated union,
  `severity = max`.

The resulting `RiskInsight` is attached to the dimension's `DimensionScore.riskInsight`.

`src/judge/aggregate.ts` carries `riskInsight` from the representative committee member
(the one whose score is closest to the mean), matching how `evidence` and `gap` propagate.

## 5. Model-drift changes

New pure helper `src/lib/drift-insights.ts`:

```ts
export function explainDrift(
  regression: RegressionReport | null,
  judgeDrift?: JudgeDriftReport,
): DriftInsights;
```

It converts the numeric `RegressionReport` (pass-rate delta, avg-score delta, per-dimension
deltas) into:
- a plain-language `summary`,
- a `dimensions[]` list of drifted dimensions each with `{ delta, severity, reason, suggestion }`
  (dimension-specific suggestions for bias/correctness/faithfulness/guardrail, generic
  fallback otherwise),
- top-level `suggestions[]`,
- a `judgeConfigChanged` caveat when `judgeDrift.detected` (score drop may be confounded by
  a judge-committee change, not a true model regression).

Wired into `GET /api/regression/status` as `driftInsights` (additive field).

## 6. Assumptions (spec fidelity — flag if wrong)

1. **"Model drift" = the existing baseline/regression system** (behavioural drift of the
   agent-under-test across runs), enhanced with reasons + suggestions — not a brand-new
   per-response metric. Justified by the existing `Baseline`/`detectRegression`/
   `/api/regression/status` infrastructure.
2. **Hallucination is a derived insight**, not a new scored dimension — to avoid disrupting
   the 15-dimension weighting, pass/fail thresholds, and existing baselines. Matches how the
   codebase already treats hallucination (via `correctness` + `faithfulness`).
3. **"All domains / all scenarios"** is satisfied at the judge layer: risk insights are
   emitted for every scenario automatically, so no per-scenario YAML edits are required.

## 7. Testing

- `src/judge/__tests__/risk-insights.test.ts` — normalize/merge/parse behaviour.
- `src/lib/__tests__/drift-insights.test.ts` — `explainDrift` over representative reports.
- `src/judge/__tests__/aggregate.test.ts` — riskInsight propagation through the committee.
- Report generator test — risk block renders.
- `npm run lint` (tsc --noEmit) + `npm test` must pass.

## 8. Backward compatibility

All new fields are optional. Old eval results (no `riskInsight`) render exactly as before.
No schema migration. No change to scoring, pass/fail, or committee aggregation semantics.
