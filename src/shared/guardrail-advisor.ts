// Zod request schemas for the Guardrail Advisor API. Kept in src/shared/ per spec.
import { z } from 'zod';

export const createSessionSchema = z.object({
  domain: z.string().min(1),
  subFunction: z.string().min(1),
});

export const recommendSchema = z.object({
  answers: z.record(z.union([z.string(), z.array(z.string())])).default({}),
});

export const formatSchema = z.object({
  platform: z.enum(['bedrock', 'langchain', 'copilot', 'foundry', 'strands']),
  // Empty array = format all recommendations for the session.
  guardrailIds: z.array(z.string()).default([]),
});

export const verifyCitationsSchema = z.object({
  citations: z.array(z.string().min(1)).min(1).max(12),
  // Optional context (e.g. "banking / wealth-advisory — <guardrail title>") to aid verification.
  context: z.string().max(500).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type RecommendInput = z.infer<typeof recommendSchema>;
export type FormatInput = z.infer<typeof formatSchema>;
export type VerifyCitationsInput = z.infer<typeof verifyCitationsSchema>;
