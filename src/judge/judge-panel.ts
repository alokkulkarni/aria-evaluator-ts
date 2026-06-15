// src/judge/judge-panel.ts
// Orchestrates a committee of JudgeMembers: runs them in parallel, tolerates
// per-member failure, and merges their votes into one ensemble EvalResult.

import type { EvalResult, JudgeCostBreakdown, JudgeRef } from '../types/evaluation.js';
import type { Transcript } from '../types/transcript.js';
import type { Scenario } from '../types/scenario.js';
import {
  DEFAULT_JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_TEMPERATURE,
} from '../shared/judge-config.js';
import {
  assessVendorDiversity,
  committeeLabel,
  computeJudgeConfigHash,
  routeJudges,
  scenarioCategory,
  type JudgeCommitteeConfig,
  type JudgeProviderId,
  type JudgeSpec,
  type ScenarioCategory,
} from '../shared/judge-committee.js';
import { estimateCost } from '../lib/model-pricing.js';
import { JudgeMember } from './llm-judge.js';
import { aggregateMemberScores, computeOverallAndPass, type MemberOutcome } from './aggregate.js';
import { availableProviders, createJudgeProvider } from './providers/factory.js';
import type { JudgeProvider } from './providers/types.js';

type ScenarioInput = Pick<Scenario, 'expected_escalation' | 'escalation_reason' | 'escalation_policy' | 'attack_type' | 'domain'>;

export interface JudgePanelOptions {
  /** Override provider construction (used by tests). */
  createProvider?: (provider: JudgeProviderId) => JudgeProvider;
  /** Override which providers are considered credentialed (used by tests). */
  availableProviders?: Set<JudgeProviderId>;
  /** Calibrated weights keyed by judge modelId (opt-in). Overrides JUDGE_WEIGHTS env. */
  weights?: Record<string, number>;
}

function parseWeightsEnv(): Record<string, number> {
  const raw = process.env['JUDGE_WEIGHTS'];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number | { weight?: number }>;
    const out: Record<string, number> = {};
    for (const [modelId, value] of Object.entries(parsed)) {
      out[modelId] = typeof value === 'number' ? value : value?.weight ?? 1;
    }
    return out;
  } catch {
    return {};
  }
}

export class JudgePanel {
  private readonly committee: JudgeCommitteeConfig;
  private readonly createProvider: (provider: JudgeProviderId) => JudgeProvider;
  private readonly available: Set<JudgeProviderId>;
  /** modelId → calibrated weight. Empty = equal-weight (Phase 1 default). */
  private readonly weights: Record<string, number>;

  constructor(committee: JudgeCommitteeConfig, opts: JudgePanelOptions = {}) {
    this.committee = committee;
    this.createProvider = opts.createProvider ?? createJudgeProvider;
    this.available = opts.availableProviders ?? availableProviders();
    this.weights = opts.weights ?? parseWeightsEnv();
  }

  /**
   * The judges that will actually run: credentialed providers, calibration-blocked
   * judges dropped, then specialist routing for the scenario category (additive —
   * matching specialists + generalists). Never empty.
   */
  activeJudges(category: ScenarioCategory = 'generalist'): JudgeSpec[] {
    let active = this.committee.judges.filter((j) => this.available.has(j.provider));
    // Opt-in calibration: drop judges explicitly weighted 0 (blocked) — but never
    // drop the whole committee.
    if (Object.keys(this.weights).length > 0) {
      const nonBlocked = active.filter((j) => (this.weights[j.modelId] ?? 1) > 0);
      if (nonBlocked.length > 0) active = nonBlocked;
    }
    if (active.length === 0) {
      // Defensive fallback: never run with zero judges — use any Bedrock member.
      const bedrock = this.committee.judges.find((j) => j.provider === 'bedrock');
      return bedrock ? [bedrock] : this.committee.judges.slice(0, 1);
    }
    // Specialist routing (additive; routeJudges falls back to `active` if nothing matches).
    return routeJudges(active, category);
  }

  async evaluate(
    transcript: Transcript,
    goal: string,
    scenario?: ScenarioInput,
  ): Promise<EvalResult> {
    const isSecurity = scenario?.attack_type != null;
    const category = scenarioCategory({ attack_type: scenario?.attack_type, domain: scenario?.domain });
    const specs = this.activeJudges(category);
    if (category !== 'generalist') {
      const specialists = specs.filter((s) => (s.role ?? 'generalist') === category).length;
      console.log(`  🎯  Routing: ${category} scenario → ${specialists} specialist(s) + ${specs.length - specialists} generalist(s)`);
    }
    const skipped = this.committee.judges.filter((j) => !specs.includes(j));
    if (skipped.length > 0) {
      console.warn(`  ⚠  Skipping judges without credentials: ${skipped.map((j) => `${j.id}(${j.provider})`).join(', ')}`);
    }
    console.log(`  🧑‍⚖️  Judge committee: ${specs.map((s) => `${s.id}/${s.provider}:${s.modelId}`).join(', ')}`);

    // Cross-family guard: warn when the active committee is single-vendor, which
    // re-introduces the self-enhancement bias the committee exists to avoid.
    const diversity = assessVendorDiversity(specs);
    if (!diversity.crossVendor && specs.length > 0) {
      console.warn(
        `  ⚠  Single-vendor judge committee (${diversity.vendors.join(', ')}). ` +
          `Add a cross-vendor judge (e.g. set OPENAI_API_KEY) to mitigate self-enhancement bias.`,
      );
    }

    const shared = {
      systemPrompt: this.committee.systemPrompt,
      temperature: Number(DEFAULT_JUDGE_TEMPERATURE),
      maxTokens: Number(DEFAULT_JUDGE_MAX_TOKENS),
    };

    const settled = await Promise.allSettled(
      specs.map(async (spec) => {
        const member = new JudgeMember(spec, this.createProvider(spec.provider), shared);
        const result = await member.evaluate(transcript, goal, scenario);
        return { spec, result };
      }),
    );

    const outcomes: MemberOutcome[] = [];
    const breakdown: JudgeCostBreakdown[] = [];
    const judges: JudgeRef[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]!;
      const spec = specs[i]!;
      if (s.status === 'rejected') {
        const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
        console.warn(`  ⚠  Judge ${spec.id}/${spec.provider} failed: ${reason}`);
        continue;
      }
      const { result } = s.value;
      const inTok = result.judgeTokenInputEstimate ?? 0;
      const outTok = result.judgeTokenOutputEstimate ?? 0;
      inputTokens += inTok;
      outputTokens += outTok;
      const cost = estimateCost(spec.modelId, inTok, outTok);
      const judgeRef: JudgeRef = { id: spec.id, provider: spec.provider, modelId: spec.modelId, role: spec.role };
      judges.push(judgeRef);
      breakdown.push({
        judgeId: spec.id,
        provider: spec.provider,
        modelId: spec.modelId,
        inputTokens: inTok,
        outputTokens: outTok,
        costUsd: cost?.costUsd ?? null,
      });
      outcomes.push({ judge: judgeRef, dimensionScores: result.dimensionScores });
    }

    const judgeConfigHash = computeJudgeConfigHash(this.committee);

    // All judges failed → honest fallback result, never crash the run.
    if (outcomes.length === 0) {
      return {
        runId: transcript.id,
        scenarioName: transcript.scenarioName,
        overallScore: 0,
        passed: false,
        dimensionScores: {},
        summary: 'Evaluation failed: every judge in the committee errored. See logs for details.',
        judgeModel: committeeLabel(this.committee),
        evaluatedAt: new Date().toISOString(),
        judgeModels: specs.map((s) => s.modelId),
        judges: [],
        judgeBreakdown: [],
        judgeTokenInputEstimate: 0,
        judgeTokenOutputEstimate: 0,
        judgeTokenTotalEstimate: 0,
        judgeAgreement: 0,
        requiresHumanReview: true,
        judgeConfigHash,
        scenarioType: isSecurity ? 'security' : 'quality',
      };
    }

    // Map calibrated modelId-weights onto the surviving members (by judgeId).
    const idWeights: Record<string, number> = {};
    let weightingActive = false;
    for (const judge of judges) {
      const w = this.weights[judge.modelId];
      if (w != null) {
        idWeights[judge.id] = w;
        weightingActive = true;
      }
    }
    if (weightingActive) {
      console.log(`  ⚖️  Calibrated weighting active: ${judges.map((j) => `${j.modelId}=${idWeights[j.id] ?? 1}`).join(', ')}`);
    }

    const { dimensionScores, judgeAgreement, requiresHumanReview } = aggregateMemberScores(
      outcomes,
      this.committee.disagreementThreshold,
      weightingActive ? idWeights : undefined,
    );
    const { overallScore, passed } = computeOverallAndPass(dimensionScores, isSecurity);

    const failingDims = Object.entries(dimensionScores)
      .filter(([, ds]) => ds.score < 6)
      .sort(([, a], [, b]) => a.score - b.score)
      .slice(0, 3)
      .map(([id, ds]) => `${id.replace(/_/g, ' ')} (${ds.score}/10)`)
      .join(', ');
    const disagreeNote = requiresHumanReview ? ' Judges disagreed — flagged for review.' : '';
    const summary = passed
      ? `Overall score: ${overallScore.toFixed(1)}/10. PASS (${outcomes.length}-judge committee).${disagreeNote}`
      : `Overall score: ${overallScore.toFixed(1)}/10. FAIL. Low scores: ${failingDims || 'see dimension breakdown'}.${disagreeNote}`;

    return {
      runId: transcript.id,
      scenarioName: transcript.scenarioName,
      overallScore: Math.round(overallScore * 10) / 10,
      passed,
      dimensionScores,
      summary,
      judgeModel: committeeLabel(this.committee),
      evaluatedAt: new Date().toISOString(),
      judgeModels: judges.map((j) => j.modelId),
      judges,
      judgeBreakdown: breakdown,
      judgeTokenInputEstimate: inputTokens,
      judgeTokenOutputEstimate: outputTokens,
      judgeTokenTotalEstimate: inputTokens + outputTokens,
      judgeAgreement,
      requiresHumanReview,
      judgeConfigHash,
      scenarioType: isSecurity ? 'security' : 'quality',
    };
  }
}
