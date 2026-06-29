// Zod request schemas for the Guardrail Advisor API. Kept in src/shared/ per spec.
import { z } from 'zod';

// Domain / sub-function ids become the `domain:subFunction` knowledge-base key, so
// they must be slug-safe — alphanumeric + dashes only. This is the security boundary
// that rejects path traversal (`..`, `/`) per CLAUDE.md. Curated taxonomy ids already
// match this; custom ids are slugified by the client to `custom-<slug>`.
const slugId = z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, 'must be lowercase alphanumeric + dashes');

// Optional free-text for user-defined (custom) domains/functions. The description
// grounds the clarifier + AI suggester when there's no curated KB entry.
export const createSessionSchema = z
  .object({
    domain: slugId,
    subFunction: slugId,
    domainLabel: z.string().min(1).max(80).optional(),
    domainDescription: z.string().min(1).max(2000).optional(),
    subFunctionLabel: z.string().min(1).max(80).optional(),
    subFunctionDescription: z.string().min(1).max(2000).optional(),
  })
  // A custom label is meaningless to the LLM without a description, and a description is
  // what marks a session "custom" (drives the AI suggester). Require them together.
  .refine((d) => !d.domainLabel || !!d.domainDescription, {
    message: 'domainDescription is required when domainLabel is set',
    path: ['domainDescription'],
  })
  .refine((d) => !d.subFunctionLabel || !!d.subFunctionDescription, {
    message: 'subFunctionDescription is required when subFunctionLabel is set',
    path: ['subFunctionDescription'],
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
