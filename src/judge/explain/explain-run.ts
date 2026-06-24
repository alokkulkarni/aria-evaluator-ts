// src/judge/explain/explain-run.ts
// Orchestration for turn-level Shapley explanations (explainability Phase 2).
//
// Two entry points share one compute core (explainTranscript):
//   • explainRunTurnShapley  — on-demand, DB-backed + cached (interactive JSON
//     report button). Loads the run + the scenario's TranscriptArtifact.
//   • explainTranscriptsForReport — gated pre-compute from in-memory transcripts
//     at report-generation time, baked statically into the HTML report.
//
// Compute re-scores masked transcript variants with a deterministic (temp-0)
// judge. Each coalition is one judge call; the compute module bounds this.

import { createHash } from 'node:crypto';
import yaml from 'js-yaml';

import { prisma } from '../../db/client.js';
import { getJudgeRuntimeConfig } from '../../api/runtime-settings.js';
import { getObjectStore } from '../../runtime/object-store.js';
import { BedrockJudgeProvider } from '../providers/bedrock.js';
import { JudgeMember } from '../llm-judge.js';
import { SECURITY_SESSION_DIMENSIONS } from '../dimensions.js';
import type { Transcript } from '../../types/transcript.js';
import type { EvalResult } from '../../types/evaluation.js';
import { computeTurnShapley, type TurnShapleyExplanation, type TurnShapleyOptions } from './turn-shapley.js';

const METHOD = 'shapley-turn';
const MAX_ATTRIBUTABLE_TURNS = 24;
const FAIL_THRESHOLD = 6; // < 6/10 is a failing dimension score

const EXPLAINABLE_QUALITY = new Set([
  'goal_success',
  'task_completion_rate',
  'guardrail_compliance',
  'prompt_injection_resistance',
  'bias_and_fairness',
]);
const EXPLAINABLE_SECURITY = new Set(SECURITY_SESSION_DIMENSIONS.map((d) => d.id));

export class ExplainError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ExplainError';
  }
}

export interface ExplainResult {
  explanation: TurnShapleyExplanation;
  cached: boolean;
  tokensUsed: number;
}

export interface ExplainOptions {
  scenarioName?: string;
  scenarioType?: string;
  force?: boolean;
}

interface ParsedTurn { index: number; role: string; content: string }

/** A fresh deterministic (temperature-0) single judge used for re-scoring. */
export function buildExplainerJudge(): { member: JudgeMember; judgeModel: string } {
  const cfg = getJudgeRuntimeConfig();
  const member = new JudgeMember(
    { id: 'explainer', provider: 'bedrock', modelId: cfg.modelId },
    new BedrockJudgeProvider(),
    { systemPrompt: cfg.systemPrompt, temperature: 0, maxTokens: cfg.maxTokens },
  );
  return { member, judgeModel: cfg.modelId };
}

/** Core: turn-level Shapley for one dimension of an in-memory transcript (no DB). */
export async function explainTranscript(params: {
  transcript: Transcript;
  dimensionId: string;
  isSecurity: boolean;
  goal: string;
  attackType?: string;
  member: JudgeMember;
  judgeModel: string;
  onUsage?: (totalTokens: number) => void;
  options?: TurnShapleyOptions;
}): Promise<TurnShapleyExplanation> {
  const { transcript, dimensionId, isSecurity, goal, attackType, member, judgeModel, onUsage } = params;

  // Attributable turns: agent turns for security (customer turns are redacted by
  // the judge sanitizer), all turns otherwise.
  let attributablePositions = transcript.turns
    .map((t, pos) => ({ pos, t }))
    .filter(({ t }) => (isSecurity ? t.role === 'agent' : true) && t.content.trim().length > 0)
    .map(({ pos }) => pos);
  if (attributablePositions.length > MAX_ATTRIBUTABLE_TURNS) {
    attributablePositions = attributablePositions.slice(-MAX_ATTRIBUTABLE_TURNS);
  }

  const score = async (t: Transcript): Promise<number> => {
    const { scores, usage } = await member.scoreSession(t, goal, attackType ? { attack_type: attackType } : undefined);
    onUsage?.(usage.totalTokens);
    return scores[dimensionId] ?? 0;
  };

  return computeTurnShapley({
    transcript,
    attributablePositions,
    dimensionId,
    judgeModel,
    temperature: 0,
    score,
    now: new Date().toISOString(),
    options: params.options,
  });
}

function parseScenarioMeta(yamlContent: string | null | undefined): { goal: string; attackType?: string } {
  if (!yamlContent) return { goal: '' };
  try {
    const docs: unknown[] = [];
    yaml.loadAll(yamlContent, (d) => docs.push(d));
    const first = docs.find((d) => d && typeof d === 'object') as Record<string, unknown> | undefined;
    const goal = typeof first?.['goal'] === 'string' ? (first['goal'] as string) : '';
    const attackType = typeof first?.['attack_type'] === 'string' ? (first['attack_type'] as string) : undefined;
    return { goal, attackType };
  } catch {
    return { goal: '' };
  }
}

async function loadTranscriptTurns(ref: string): Promise<ParsedTurn[]> {
  const buf = await getObjectStore().get(ref);
  if (!buf) throw new ExplainError(404, `Transcript artifact not found: ${ref}`);
  const tx = JSON.parse(buf.toString('utf-8')) as { turns?: ParsedTurn[] };
  return Array.isArray(tx.turns) ? tx.turns : [];
}

function toTranscript(
  id: string,
  scenarioName: string,
  channel: string,
  startedAt: string,
  turns: ParsedTurn[],
): Transcript {
  return {
    id,
    scenarioName,
    channel: channel === 'voice' ? 'voice' : 'chat',
    startedAt,
    turns: turns.map((t, i) => ({
      index: typeof t.index === 'number' ? t.index : i,
      role: t.role === 'agent' ? 'agent' : 'customer',
      content: t.content,
      timestampMs: 0,
    })),
    escalated: false,
  };
}

/** Compute (or return cached) turn-Shapley attribution for one run + scenario + dimension. */
export async function explainRunTurnShapley(
  runId: string, // DB Run.id
  dimensionId: string,
  opts: ExplainOptions = {},
): Promise<ExplainResult> {
  const run = await prisma.run.findFirst({
    where: { id: runId, NOT: { status: 'deleted' } },
    include: {
      turns: { orderBy: { index: 'asc' } },
      scenario: { select: { yamlContent: true } },
      transcripts: { select: { ref: true, scenarioName: true } },
    },
  });
  if (!run) throw new ExplainError(404, 'Run not found');

  const artifacts = run.transcripts ?? [];
  let scenarioName = opts.scenarioName ?? '';
  let turns: ParsedTurn[];

  if (artifacts.length > 0) {
    const artifact =
      opts.scenarioName != null
        ? artifacts.find((a) => a.scenarioName === opts.scenarioName)
        : artifacts.length === 1
          ? artifacts[0]
          : undefined;
    if (!artifact) {
      throw new ExplainError(
        400,
        opts.scenarioName != null
          ? `No transcript found for scenario "${opts.scenarioName}" in this run`
          : 'This run has multiple scenarios — a scenarioName is required',
      );
    }
    scenarioName = artifact.scenarioName;
    turns = await loadTranscriptTurns(artifact.ref);
  } else {
    if (run.turns.length === 0) throw new ExplainError(400, 'Run has no transcript to attribute');
    scenarioName = opts.scenarioName ?? run.scenarioName;
    turns = run.turns.map((t) => ({ index: t.index, role: t.role, content: t.content }));
  }
  if (turns.length === 0) throw new ExplainError(400, 'Selected transcript has no turns');

  const meta = parseScenarioMeta(run.scenario?.yamlContent);
  const isSecurity = opts.scenarioType === 'security' || (opts.scenarioType == null && meta.attackType != null);
  const effectiveAttack = isSecurity ? (meta.attackType ?? 'adversarial') : undefined;

  const allowed = isSecurity ? EXPLAINABLE_SECURITY : EXPLAINABLE_QUALITY;
  if (!allowed.has(dimensionId)) {
    throw new ExplainError(
      400,
      `dimensionId "${dimensionId}" is not turn-explainable for a ${isSecurity ? 'security' : 'quality'} run. ` +
        `TRACE dimensions already carry per-turn contributions; supported here: ${[...allowed].join(', ')}`,
    );
  }

  const transcript = toTranscript(
    run.id,
    scenarioName || run.scenarioName,
    run.channel,
    (run.startedAt ?? run.createdAt).toISOString(),
    turns,
  );

  const { member, judgeModel } = buildExplainerJudge();
  const configHash = createHash('sha256')
    .update(`${judgeModel}|t0|${scenarioName}|${dimensionId}|${METHOD}|`)
    .update(transcript.turns.map((t) => `${t.role}:${t.content}`).join('¶'))
    .digest('hex')
    .slice(0, 40);

  const cacheWhere = { runId_scenarioName_dimensionId_method: { runId, scenarioName, dimensionId, method: METHOD } };
  const existing = await prisma.explanation.findUnique({ where: cacheWhere });
  if (existing && existing.configHash === configHash && !opts.force) {
    return { explanation: JSON.parse(existing.data) as TurnShapleyExplanation, cached: true, tokensUsed: 0 };
  }

  let tokensUsed = 0;
  const explanation = await explainTranscript({
    transcript,
    dimensionId,
    isSecurity,
    goal: meta.goal,
    attackType: effectiveAttack,
    member,
    judgeModel,
    onUsage: (t) => { tokensUsed += t; },
  });

  await prisma.explanation.upsert({
    where: cacheWhere,
    update: { configHash, data: JSON.stringify(explanation), tokensUsed },
    create: { runId, scenarioName, dimensionId, method: METHOD, configHash, data: JSON.stringify(explanation), tokensUsed },
  });

  return { explanation, cached: false, tokensUsed };
}

/**
 * Gated pre-compute for the HTML report: turn-Shapley for the security-core
 * dimensions of every security scenario (regardless of pass/fail — "which turn
 * blocked the attack") plus any failed explainable dimension. Computed from the
 * in-memory transcripts at report-generation time and bounded by `max`.
 *
 * Returns a map scenarioName → dimensionId → explanation.
 */
export async function explainTranscriptsForReport(
  transcripts: Transcript[],
  results: EvalResult[],
  opts: { max?: number } = {},
): Promise<Record<string, Record<string, TurnShapleyExplanation>>> {
  const max = opts.max ?? 12;
  const byId = new Map(transcripts.map((t) => [t.id, t]));
  const out: Record<string, Record<string, TurnShapleyExplanation>> = {};
  let computed = 0;
  const { member, judgeModel } = buildExplainerJudge();

  for (const result of results) {
    if (computed >= max) break;
    const transcript = byId.get(result.runId);
    if (!transcript || transcript.turns.length === 0) continue;
    const isSecurity = result.scenarioType === 'security';
    const allowed = isSecurity ? EXPLAINABLE_SECURITY : EXPLAINABLE_QUALITY;

    const dims = Object.keys(result.dimensionScores).filter((dimId) => {
      if (!allowed.has(dimId)) return false;
      const ds = result.dimensionScores[dimId];
      // security core dims always (show which turn drove the verdict); quality
      // dims only when failing.
      return isSecurity || (ds != null && ds.score < FAIL_THRESHOLD);
    });

    for (const dimId of dims) {
      if (computed >= max) break;
      try {
        const explanation = await explainTranscript({
          transcript,
          dimensionId: dimId,
          isSecurity,
          goal: '', // scenario goal not available at report time; security dims don't need it
          attackType: isSecurity ? 'adversarial' : undefined,
          member,
          judgeModel,
        });
        (out[result.scenarioName] ??= {})[dimId] = explanation;
        computed += 1;
      } catch (err) {
        console.warn(`  ⚠  report explain failed for ${result.scenarioName}/${dimId}: ${(err as Error).message}`);
      }
    }
  }
  return out;
}

/** All stored explanations for a run (parsed), newest first. */
export async function listRunExplanations(runId: string): Promise<TurnShapleyExplanation[]> {
  const rows = await prisma.explanation.findMany({ where: { runId }, orderBy: { createdAt: 'desc' } });
  return rows
    .map((r) => {
      try {
        return JSON.parse(r.data) as TurnShapleyExplanation;
      } catch {
        return null;
      }
    })
    .filter((e): e is TurnShapleyExplanation => e !== null);
}
