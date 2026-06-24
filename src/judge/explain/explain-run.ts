// src/judge/explain/explain-run.ts
// On-demand orchestration for turn-level Shapley explanations (explainability
// Phase 2). Loads a completed run, resolves the specific scenario's transcript
// (multi-scenario "portal" runs share one DB Run.id but produce one transcript
// artifact per scenario), re-scores masked variants with a single deterministic
// (temperature-0) judge, computes per-turn Shapley values for one SESSION/
// security dimension, and caches the result keyed by (run, scenario, dimension).
//
// Note: the report UI surfaces a per-transcript `runId` (the transcript id) which
// is NOT a DB Run.id — callers must pass the DB Run.id plus the scenarioName.
//
// Cost: each coalition is one judge call. The compute module bounds this (exact
// for short conversations; sampled + capped otherwise); cached results are free.

import { createHash } from 'node:crypto';
import yaml from 'js-yaml';

import { prisma } from '../../db/client.js';
import { getJudgeRuntimeConfig } from '../../api/runtime-settings.js';
import { getObjectStore } from '../../runtime/object-store.js';
import { BedrockJudgeProvider } from '../providers/bedrock.js';
import { JudgeMember } from '../llm-judge.js';
import { SECURITY_SESSION_DIMENSIONS } from '../dimensions.js';
import type { Transcript } from '../../types/transcript.js';
import { computeTurnShapley, type TurnShapleyExplanation } from './turn-shapley.js';

const METHOD = 'shapley-turn';
const MAX_ATTRIBUTABLE_TURNS = 24;

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
  /** Scenario within the run to attribute (required for multi-scenario runs). */
  scenarioName?: string;
  /** 'security' | 'quality' — from the report result; drives dim set + sanitizer. */
  scenarioType?: string;
  force?: boolean;
}

interface ParsedTurn { index: number; role: string; content: string }

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

  // Resolve which conversation to attribute. Prefer the per-scenario transcript
  // artifact (multi-scenario runs concatenate all turns in the Turn table, so the
  // artifact is the only clean per-scenario source). Fall back to the Turn rows
  // for legacy single-conversation runs without artifacts.
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

  // Security vs quality: trust the caller's scenarioType (from the report), else
  // derive from the scenario YAML's attack_type.
  const meta = parseScenarioMeta(run.scenario?.yamlContent);
  const isSecurity = opts.scenarioType === 'security' || (opts.scenarioType == null && meta.attackType != null);
  const effectiveAttack = isSecurity ? (meta.attackType ?? 'adversarial') : undefined;
  const goal = meta.goal; // best-effort; '' for multi-scenario portal runs

  const allowed = isSecurity ? EXPLAINABLE_SECURITY : EXPLAINABLE_QUALITY;
  if (!allowed.has(dimensionId)) {
    throw new ExplainError(
      400,
      `dimensionId "${dimensionId}" is not turn-explainable for a ${isSecurity ? 'security' : 'quality'} run. ` +
        `TRACE dimensions already carry per-turn contributions; supported here: ${[...allowed].join(', ')}`,
    );
  }

  const transcript: Transcript = {
    id: run.id,
    scenarioName: scenarioName || run.scenarioName,
    channel: run.channel === 'voice' ? 'voice' : 'chat',
    startedAt: (run.startedAt ?? run.createdAt).toISOString(),
    turns: turns.map((t, i) => ({
      index: typeof t.index === 'number' ? t.index : i,
      role: t.role === 'agent' ? 'agent' : 'customer',
      content: t.content,
      timestampMs: 0,
    })),
    escalated: false,
  };

  const cfg = getJudgeRuntimeConfig();
  const configHash = createHash('sha256')
    .update(`${cfg.modelId}|t0|${scenarioName}|${dimensionId}|${METHOD}|`)
    .update(transcript.turns.map((t) => `${t.role}:${t.content}`).join('¶'))
    .digest('hex')
    .slice(0, 40);

  const cacheWhere = { runId_scenarioName_dimensionId_method: { runId, scenarioName, dimensionId, method: METHOD } };
  const existing = await prisma.explanation.findUnique({ where: cacheWhere });
  if (existing && existing.configHash === configHash && !opts.force) {
    return { explanation: JSON.parse(existing.data) as TurnShapleyExplanation, cached: true, tokensUsed: 0 };
  }

  // Attributable turns: agent turns for security (customer turns are redacted by
  // the judge sanitizer), all turns otherwise.
  let attributablePositions = transcript.turns
    .map((t, pos) => ({ pos, t }))
    .filter(({ t }) => (isSecurity ? t.role === 'agent' : true) && t.content.trim().length > 0)
    .map(({ pos }) => pos);
  if (attributablePositions.length > MAX_ATTRIBUTABLE_TURNS) {
    attributablePositions = attributablePositions.slice(-MAX_ATTRIBUTABLE_TURNS);
  }

  const member = new JudgeMember(
    { id: 'explainer', provider: 'bedrock', modelId: cfg.modelId },
    new BedrockJudgeProvider(),
    { systemPrompt: cfg.systemPrompt, temperature: 0, maxTokens: cfg.maxTokens },
  );

  let tokensUsed = 0;
  const score = async (t: Transcript): Promise<number> => {
    const { scores, usage } = await member.scoreSession(
      t,
      goal,
      effectiveAttack ? { attack_type: effectiveAttack } : undefined,
    );
    tokensUsed += usage.totalTokens;
    return scores[dimensionId] ?? 0;
  };

  const explanation = await computeTurnShapley({
    transcript,
    attributablePositions,
    dimensionId,
    judgeModel: cfg.modelId,
    temperature: 0,
    score,
    now: new Date().toISOString(),
  });

  await prisma.explanation.upsert({
    where: cacheWhere,
    update: { configHash, data: JSON.stringify(explanation), tokensUsed },
    create: { runId, scenarioName, dimensionId, method: METHOD, configHash, data: JSON.stringify(explanation), tokensUsed },
  });

  return { explanation, cached: false, tokensUsed };
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
