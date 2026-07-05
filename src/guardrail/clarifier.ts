// LLM-based clarifying-question generator. Asks Claude (via Bedrock) for 3–5
// structured questions seeded with the chosen domain + sub-function, validates the
// response with Zod, and falls back to a built-in set so the UI never breaks.
import { z } from 'zod';

import { BedrockJudgeProvider } from '../judge/providers/bedrock.js';
import type { ClarifyingQuestion, GuardrailContext } from './types.js';

// The spec named claude-3-haiku; we use the codebase's current Haiku (Claude Haiku
// 4.5) from the judge model registry — cheap and fast, and a valid Bedrock id.
const CLARIFIER_MODEL_ID =
  process.env['GUARDRAIL_CLARIFIER_MODEL_ID']?.trim() || 'anthropic.claude-haiku-4-5-20251001-v1:0';

const optionSchema = z.object({ value: z.string().min(1), label: z.string().min(1) });
const questionSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    type: z.enum(['single-choice', 'multi-choice', 'text']),
    options: z.array(optionSchema).optional(),
  })
  .refine((q) => q.type === 'text' || (q.options?.length ?? 0) >= 2, {
    message: 'single-choice / multi-choice questions require at least 2 options',
  });

/** Hardcoded set returned when the LLM is unavailable or its response is invalid. */
export const FALLBACK_QUESTIONS: ClarifyingQuestion[] = [
  {
    id: 'jurisdiction',
    text: 'Which regulatory regions apply to this agent?',
    type: 'multi-choice',
    options: [
      { value: 'EU', label: 'EU / GDPR' },
      { value: 'US', label: 'US / FINRA / SEC' },
      { value: 'UK', label: 'UK / FCA' },
      { value: 'HIPAA', label: 'US Healthcare / HIPAA' },
    ],
  },
  {
    id: 'user-facing',
    text: 'Who interacts with this agent?',
    type: 'single-choice',
    options: [
      { value: 'customers', label: 'External customers' },
      { value: 'staff', label: 'Internal staff only' },
    ],
  },
  {
    id: 'pii-types',
    text: 'What kinds of personal data does it handle?',
    type: 'multi-choice',
    options: [
      { value: 'ssn', label: 'SSN / national ID' },
      { value: 'account', label: 'Account / card numbers' },
      { value: 'health', label: 'Health records' },
      { value: 'none', label: 'No PII' },
    ],
  },
  {
    id: 'autonomy-level',
    text: 'What can the agent do?',
    type: 'single-choice',
    options: [
      { value: 'read-only', label: 'Read-only (information)' },
      { value: 'transactional', label: 'Execute transactions / update records' },
      { value: 'agentic', label: 'Take autonomous multi-step actions' },
    ],
  },
];

const SYSTEM_PROMPT = [
  'You are a compliance assistant that helps configure AI guardrails.',
  'Generate between 3 and 5 clarifying questions tailored to the given domain and sub-function.',
  'The domain / sub-function may be user-defined; when a description is provided, use it to',
  'ground the questions for that specific agent.',
  'Cover jurisdiction, user type, data sensitivity (PII), and autonomy where relevant.',
  'Respond with ONLY a JSON array (no prose, no markdown fences). Each element must be:',
  '{ "id": string, "text": string, "type": "single-choice" | "multi-choice" | "text", "options"?: [{ "value": string, "label": string }] }',
  'single-choice and multi-choice questions MUST include at least 2 options. text questions omit options.',
  'Phrase the question text and option labels naturally for the domain, but for these standard',
  'dimensions the option `value` MUST come from this fixed vocabulary (the engine keys off it):',
  '- jurisdiction → one of: eu, us, uk, hipaa, apac, other',
  '- user type → one of: customers, staff, institutional',
  '- data sensitivity → from: account-numbers, ssn, health, biometric, income, none',
  '- autonomy → one of: read-only, advisory, transactional, agentic',
].join('\n');

function buildUserPrompt(domain: string, subFunction: string, context?: GuardrailContext): string {
  const lines = [`Domain: ${domain}`, `Sub-function: ${subFunction}`];
  if (context?.domainLabel) lines.push(`Domain label: ${context.domainLabel}`);
  if (context?.domainDescription) lines.push(`Domain description: ${context.domainDescription}`);
  if (context?.subFunctionLabel) lines.push(`Sub-function label: ${context.subFunctionLabel}`);
  if (context?.subFunctionDescription)
    lines.push(`Sub-function description: ${context.subFunctionDescription}`);
  lines.push('Return the JSON array of clarifying questions.');
  return lines.join('\n');
}

/** Extract the first JSON array substring, tolerating markdown fences / prose. */
function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function parseQuestions(text: string): ClarifyingQuestion[] | null {
  const json = extractJsonArray(text);
  if (!json) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const valid: ClarifyingQuestion[] = [];
  for (const item of raw) {
    const parsed = questionSchema.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  if (valid.length < 3) return null;
  return valid.slice(0, 5);
}

/** Generate 3–5 clarifying questions for a domain + sub-function. `context` carries
 *  free-text label/description for user-defined (custom) domains/functions. */
export async function generateQuestions(
  domain: string,
  subFunction: string,
  context?: GuardrailContext,
): Promise<ClarifyingQuestion[]> {
  try {
    const provider = new BedrockJudgeProvider();
    const resp = await provider.complete({
      modelId: CLARIFIER_MODEL_ID,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(domain, subFunction, context),
      temperature: 0.2,
      maxTokens: 1024,
    });
    return parseQuestions(resp.text) ?? FALLBACK_QUESTIONS;
  } catch {
    return FALLBACK_QUESTIONS;
  }
}
