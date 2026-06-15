// src/judge/providers/types.ts
// Unified judge-provider interface so the committee can mix vendors
// (Bedrock, OpenAI, Azure OpenAI, Anthropic-direct, Gemini) behind one API.

import type { TokenEstimate } from '../../lib/observability.js';
import type { JudgeProviderId } from '../../shared/judge-committee.js';

export interface ProviderRequest {
  /** Provider-native model identifier (bare Bedrock id, OpenAI model, Azure deployment, …). */
  modelId: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  /** Bedrock-only region override. */
  region?: string;
}

export interface ProviderResponse {
  /** Raw model text (JSON is parsed downstream by the judge member). */
  text: string;
  usage: TokenEstimate;
}

export interface JudgeProvider {
  readonly id: JudgeProviderId;
  complete(req: ProviderRequest): Promise<ProviderResponse>;
}

/** Provider credentials are not configured — the committee skips this member. */
export class MissingCredentialsError extends Error {
  constructor(public readonly provider: JudgeProviderId, message: string) {
    super(message);
    this.name = 'MissingCredentialsError';
  }
}

/** A configured provider call failed (network, API error, timeout, circuit open). */
export class JudgeProviderError extends Error {
  constructor(public readonly provider: JudgeProviderId, message: string) {
    super(message);
    this.name = 'JudgeProviderError';
  }
}

/** Per-call wall-clock cap for any single judge inference. */
export const JUDGE_CALL_TIMEOUT_MS = 90_000;

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
