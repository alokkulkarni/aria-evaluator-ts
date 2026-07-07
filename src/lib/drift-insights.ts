// src/lib/drift-insights.ts
// Pure helper: turn the numeric RegressionReport (agent-under-test drift vs a
// baseline) into human-readable reasons + improvement suggestions. No IO imports
// so it is trivially unit-tested. See docs/RISK_INSIGHTS_SPEC.md §5.

import type { RegressionReport } from './metrics.js';
import type { JudgeDriftReport } from './judge-drift.js';

export interface DriftDimensionInsight {
  dimensionId: string;
  /** Human-friendly dimension label (underscores → spaces). */
  label: string;
  oldScore: number;
  newScore: number;
  /** newScore − oldScore, in 0–10 units (negative = regression). */
  delta: number;
  severity: string;
  /** Why this dimension is flagged as drifted. */
  reason: string;
  /** Concrete action to recover the lost quality. */
  suggestion: string;
}

export interface DriftInsights {
  detected: boolean;
  severity: RegressionReport['severity'];
  /** One-line plain-language summary of the drift. */
  summary: string;
  passRateDeltaPercent: number;
  avgScoreDelta: number;
  /** Dimensions that regressed beyond the score-drop threshold. */
  dimensions: DriftDimensionInsight[];
  /** De-duplicated, prioritized improvement suggestions for the whole run. */
  suggestions: string[];
  /** True when the judge committee changed since the baseline (see caveats). */
  judgeConfigChanged: boolean;
  /** Warnings that qualify how the drift numbers should be read. */
  caveats: string[];
}

/** A score drop this large (0–10 units) counts as a regressed dimension. */
const DIM_DROP_THRESHOLD = 0.5;

/** Per-dimension remediation guidance; falls back to a generic message. */
const DIMENSION_SUGGESTIONS: Record<string, string> = {
  correctness:
    'Tighten grounding — require the agent to rely on retrieved facts and refuse figures, dates, or account details it cannot verify (this is the main hallucination lever).',
  faithfulness:
    'Feed the full confirmed conversation state back into each prompt so the agent stops contradicting details it established earlier in the chat.',
  bias_and_fairness:
    'Strengthen fairness guardrails: strip demographic proxies (name, postcode, accent, language) before the agent decides, and template responses so every customer is offered the same options.',
  helpfulness:
    'Review recent prompt/model changes; ensure the agent answers the actual question before adding caveats or deflecting.',
  response_relevance:
    'Check for prompt bloat or context truncation — the agent is drifting off-topic relative to the baseline.',
  conciseness:
    'Trim system-prompt boilerplate and add a brevity instruction; responses have grown more verbose than the baseline.',
  guardrail_compliance:
    'Re-check guardrail coverage for this attack type — a drop here means the agent is increasingly leaking restricted info or complying with adversarial intent.',
  prompt_injection_resistance:
    'Harden system-prompt isolation and re-test injection payloads; the agent is increasingly following injected instructions.',
  tone_and_empathy:
    'Re-check the persona/tone instructions; empathy has regressed since the baseline.',
  clarity:
    'Reduce jargon and simplify structure in the agent prompt; responses are less clear than the baseline.',
  goal_success:
    'Trace failing conversations end-to-end — the agent is completing the customer goal less often than the baseline.',
  task_completion_rate:
    'Audit multi-step flows for dropped steps; the agent is finishing fewer required tasks than the baseline.',
};

function labelFor(dimId: string): string {
  return dimId.replace(/_/g, ' ');
}

function suggestionFor(dimId: string): string {
  return (
    DIMENSION_SUGGESTIONS[dimId] ??
    'Investigate model or prompt changes since the baseline and compare recent transcripts for this dimension.'
  );
}

/**
 * Explain a regression report as drift reasons + improvement suggestions.
 * `regression` may be null when there is nothing to compare (no recent runs).
 * When `judgeDrift.detected`, the score drop may be an artefact of a judge change
 * rather than a real model regression — surfaced as a caveat, not a fix.
 */
export function explainDrift(
  regression: RegressionReport | null,
  judgeDrift?: JudgeDriftReport,
): DriftInsights {
  const judgeConfigChanged = judgeDrift?.detected ?? false;
  const caveats: string[] = [];
  if (judgeConfigChanged) {
    const hashes = judgeDrift?.mismatchedHashes ?? [];
    caveats.push(
      `The judge committee configuration changed since the baseline${
        hashes.length ? ` (${hashes.length} differing config${hashes.length > 1 ? 's' : ''})` : ''
      }. Re-baseline with the current judges before treating this score drop as a true model regression.`,
    );
  }

  if (!regression) {
    return {
      detected: false,
      severity: 'NONE',
      summary: 'No recent runs to compare against the baseline yet.',
      passRateDeltaPercent: 0,
      avgScoreDelta: 0,
      dimensions: [],
      suggestions: [],
      judgeConfigChanged,
      caveats,
    };
  }

  const dimensions: DriftDimensionInsight[] = Object.entries(regression.dimensionDeltas)
    .filter(([, d]) => d.delta < 0 && (d.severity !== 'none' || Math.abs(d.delta) >= DIM_DROP_THRESHOLD))
    .map(([dimensionId, d]) => {
      const drop = Math.abs(d.delta).toFixed(1);
      return {
        dimensionId,
        label: labelFor(dimensionId),
        oldScore: d.old,
        newScore: d.new,
        delta: d.delta,
        severity: d.severity,
        reason: `${labelFor(dimensionId)} dropped ${drop} points (baseline ${d.old.toFixed(1)}/10 → recent ${d.new.toFixed(1)}/10).`,
        suggestion: suggestionFor(dimensionId),
      };
    })
    .sort((a, b) => a.delta - b.delta); // biggest drop first

  const detected = regression.severity !== 'NONE' || dimensions.length > 0;

  // Prioritized, de-duplicated suggestions: pass-rate/score first, then per-dimension.
  const suggestions: string[] = [];
  if (regression.passRateDeltaPercent <= -1) {
    suggestions.push(
      `Pass rate fell ${Math.abs(regression.passRateDeltaPercent).toFixed(1)} points — treat as a release blocker and bisect recent agent/prompt/model changes.`,
    );
  }
  if (regression.avgScoreDelta <= -0.1) {
    suggestions.push(
      `Average score fell ${Math.abs(regression.avgScoreDelta).toFixed(1)} points — compare recent transcripts against the baseline to locate the regression.`,
    );
  }
  const seenSuggestions = new Set(suggestions.map((s) => s.toLowerCase()));
  for (const dim of dimensions) {
    const key = dim.suggestion.toLowerCase();
    if (seenSuggestions.has(key)) continue;
    seenSuggestions.add(key);
    suggestions.push(dim.suggestion);
  }

  const summary = detected
    ? `${regression.severity} drift detected: ` +
      `pass rate ${regression.passRateDeltaPercent >= 0 ? '+' : ''}${regression.passRateDeltaPercent.toFixed(1)} pts, ` +
      `avg score ${regression.avgScoreDelta >= 0 ? '+' : ''}${regression.avgScoreDelta.toFixed(1)} pts, ` +
      `${dimensions.length} dimension${dimensions.length === 1 ? '' : 's'} regressed.`
    : 'No material drift from the baseline.';

  return {
    detected,
    severity: regression.severity,
    summary,
    passRateDeltaPercent: regression.passRateDeltaPercent,
    avgScoreDelta: regression.avgScoreDelta,
    dimensions,
    suggestions,
    judgeConfigChanged,
    caveats,
  };
}
