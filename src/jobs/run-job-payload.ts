import { z } from 'zod';

export const RUN_PROVIDERS = [
  'connect',
  'lex',
  'azure',
  'strands',
  'copilot',
  'custom',
  'openapi',
  'websocket',
] as const;

export type RunProvider = typeof RUN_PROVIDERS[number];

const runJobPayloadSchema = z.object({
  provider: z.enum(RUN_PROVIDERS),
  channel: z.enum(['chat', 'voice']),
  scenarioFiles: z.array(z.string()),
  scenarioCount: z.number().int().nonnegative(),
  yamlContent: z.string().min(1),
});

export type RunJobPayload = z.infer<typeof runJobPayloadSchema>;

export function serializeRunJobPayload(payload: RunJobPayload): string {
  return JSON.stringify(runJobPayloadSchema.parse(payload));
}

export function parseRunJobPayload(payloadJson: string): RunJobPayload {
  return runJobPayloadSchema.parse(JSON.parse(payloadJson));
}
