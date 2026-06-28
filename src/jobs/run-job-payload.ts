import { z } from 'zod';
import { RUN_PROVIDERS, type RunProvider } from '../shared/provider-fields.js';

// Re-exported from the shared provider taxonomy so existing importers keep working.
export { RUN_PROVIDERS };
export type { RunProvider };

const runJobPayloadSchema = z.object({
  provider: z.enum(RUN_PROVIDERS),
  channel: z.enum(['chat', 'voice']),
  scenarioFiles: z.array(z.string()),
  scenarioCount: z.number().int().nonnegative(),
  yamlContent: z.string().min(1),
  // Concrete provider instance resolved at run-creation time. null/undefined =>
  // legacy env-var fallback (back-compat). Resolved to env overlay at exec time.
  providerInstanceId: z.string().nullish(),
});

export type RunJobPayload = z.infer<typeof runJobPayloadSchema>;

export function serializeRunJobPayload(payload: RunJobPayload): string {
  return JSON.stringify(runJobPayloadSchema.parse(payload));
}

export function parseRunJobPayload(payloadJson: string): RunJobPayload {
  return runJobPayloadSchema.parse(JSON.parse(payloadJson));
}
