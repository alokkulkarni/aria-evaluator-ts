// src/types/evaluation.ts

import type { JudgeProviderId, JudgeRole } from '../shared/judge-committee.js';

/** A single judge's vote on one dimension, retained inside the aggregated score. */
export interface JudgeVote {
  judgeId: string;
  provider: JudgeProviderId;
  modelId: string;
  score: number; // 0–10
  justification?: string;
}

export interface DimensionScore {
  score: number;         // 0–10 (committee mean when multiple judges)
  justification: string;
  evidence?: string;
  gap?: string;          // Why the score is not 10/10 — populated by judge when score < 1.0
  /** Per-judge votes that produced this score (present for committee runs). */
  judgeVotes?: JudgeVote[];
  /** max−min across judge votes, in 0–10 units. */
  spread?: number;
  /** True when spread exceeds the committee disagreement threshold. */
  disagreement?: boolean;
}

/** Lightweight reference to a committee member, stored on the result. */
export interface JudgeRef {
  id: string;
  provider: JudgeProviderId;
  modelId: string;
  role?: JudgeRole;
}

/** Per-judge token + cost accounting for a committee run. */
export interface JudgeCostBreakdown {
  judgeId: string;
  provider: JudgeProviderId;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface EvalResult {
  runId: string;
  scenarioName: string;
  overallScore: number;  // 0–10
  passed: boolean;       // score >= passingThreshold
  dimensionScores: Record<string, DimensionScore>;
  summary: string;
  recommendation?: string;
  judgeModel: string;    // committee label or single model id (back-compat)
  evaluatedAt: string;   // ISO-8601
  judgeTokenInputEstimate?: number;
  judgeTokenOutputEstimate?: number;
  judgeTokenTotalEstimate?: number;
  /** 'security' for injection/adversarial scenarios; 'quality' for normal scenarios */
  scenarioType?: 'security' | 'quality';

  // ── Multi-judge committee fields (Phase 1) ────────────────────────────────
  /** Model ids of every judge that voted. */
  judgeModels?: string[];
  /** Committee members that voted (id/provider/model/role). */
  judges?: JudgeRef[];
  /** Per-judge token + cost breakdown (summed for the run's judge cost). */
  judgeBreakdown?: JudgeCostBreakdown[];
  /** 1 − (mean per-dimension spread / 10). 1 = perfect agreement. */
  judgeAgreement?: number;
  /** True when judges disagreed beyond threshold on an active dimension. */
  requiresHumanReview?: boolean;
  /** Deterministic hash of the judge committee config (for drift detection). */
  judgeConfigHash?: string;
}

export interface Dimension {
  id: string;
  name: string;
  description: string;
  weight: number;        // 0–1 (must sum to 1 across all active dims)
  passingScore: number;  // minimum score to pass this dimension
}
