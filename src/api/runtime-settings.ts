import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { appPaths } from '../runtime/paths.js';
import { prisma } from '../db/client.js';
import {
  DEFAULT_JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_MODEL_ID,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  DEFAULT_JUDGE_TEMPERATURE,
  JUDGE_MODEL_GROUPS,
  isKnownJudgeModel,
  formatModelIdForRegion,
  isValidModelId,
  extractBareModelId,
  getModelsForRegion,
} from '../shared/judge-config.js';
import {
  availableProviders,
  buildDefaultCommittee,
  capCommittee,
  DEFAULT_DISAGREEMENT_THRESHOLD,
  parseCommitteeJson,
  type JudgeCommitteeConfig,
} from '../shared/judge-committee.js';
import { getUsageLimits } from '../shared/usage-limits.js';
import { parseNotifierConfig, type NotifierConfig } from '../lib/notifier.js';

const SETTINGS_FILE = appPaths.runtimeSettingsFile;
export const REDACTED_SECRET_VALUE = '***';

export const EDITABLE_SETTING_KEYS = [
  'EVAL_PROVIDER_DEFAULT',
  'JUDGE_MODEL_ID',
  'JUDGE_CUSTOM_MODEL_ID',
  'JUDGE_USE_CUSTOM_MODEL_ID',
  'JUDGE_TEMPERATURE',
  'JUDGE_MAX_TOKENS',
  'JUDGE_SYSTEM_PROMPT',
  'JUDGE_BEDROCK_REGION',

  // Multi-judge committee (Phase 1)
  'JUDGE_COMMITTEE',
  'JUDGE_DISAGREEMENT_THRESHOLD',
  // Calibration (Phase 3)
  'JUDGE_WEIGHTING_ENABLED',
  'JUDGE_KAPPA_TRUSTED',
  'JUDGE_KAPPA_MIN',
  'JUDGE_CALIBRATION_MIN_SAMPLES',
  // Cross-vendor judge provider credentials
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_VERSION',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  // Calibration data import (gated LMSYS Chatbot Arena dataset)
  'HUGGINGFACE_TOKEN',
  // Outbound notifications (webhook — Slack-compatible payload)
  'NOTIFY_WEBHOOK_URL',
  'NOTIFY_EVENTS',
  'NOTIFY_WEBHOOK_SECRET',

  'CONNECT_INSTANCE_ID',
  'CONNECT_REGION',
  'AWS_REGION',
  'CONNECT_CONTACT_FLOW',
  'CONNECT_CONTACT_FLOW_NAME',
  'CONNECT_WEBRTC_FLOW_ID',
  'CONNECT_WEBRTC_CONNECT_ATTEMPTS',
  'CONNECT_PHONE_NUMBER',

  'LEX_BOT_ID',
  'LEX_BOT_ALIAS_ID',
  'LEX_BOT_LOCALE_ID',
  'LEX_REGION',

  'AZURE_DIRECT_LINE_SECRET',
  'AZURE_DIRECT_LINE_ENDPOINT',
  'AZURE_DIRECT_LINE_USER_ID',

  'AZURE_OPENAI_AGENT_ENDPOINT',
  'AZURE_OPENAI_AGENT_API_KEY',
  'AZURE_OPENAI_AGENT_DEPLOYMENT',
  'AZURE_OPENAI_AGENT_API_VERSION',
  'AZURE_OPENAI_AGENT_SYSTEM_PROMPT',

  'STRANDS_ENDPOINT',
  'STRANDS_METHOD',
  'STRANDS_AUTH_TYPE',
  'STRANDS_AUTH_BEARER',
  'STRANDS_SIGV4_REGION',
  'STRANDS_SIGV4_SERVICE',
  'STRANDS_MESSAGE_FIELD',
  'STRANDS_RESPONSE_FIELD',
  'STRANDS_HISTORY_FIELD',
  'STRANDS_SESSION_ID_FIELD',
  'STRANDS_HEADERS_JSON',

  'COPILOT_DIRECT_LINE_SECRET',
  'COPILOT_DIRECT_LINE_ENDPOINT',
  'COPILOT_DIRECT_LINE_USER_ID',

  'CUSTOM_CHAT_ENDPOINT',
  'CUSTOM_CHAT_METHOD',
  'CUSTOM_CHAT_AUTH_BEARER',
  'CUSTOM_CHAT_MESSAGE_FIELD',
  'CUSTOM_CHAT_RESPONSE_FIELD',
  'CUSTOM_CHAT_HEADERS_JSON',

  'CUSTOM_VOICE_PROTOCOL',
  'DEEPGRAM_VOICE_WS_URL',
  'DEEPGRAM_API_KEY',
  'DEEPGRAM_VOICE_SETTINGS_JSON',
  'CUSTOM_VOICE_WS_URL',
  'CUSTOM_VOICE_WS_AUTH_HEADER_NAME',
  'CUSTOM_VOICE_WS_AUTH_HEADER_VALUE',
  'CUSTOM_VOICE_WS_INIT_JSON',
  'CUSTOM_VOICE_WS_SEND_TEMPLATE',
  'CUSTOM_VOICE_WS_AGENT_EVENT_TYPES',
  'CUSTOM_VOICE_WS_MESSAGE_PATH',

  'OPENAPI_SPEC_URL',
  'OPENAPI_ENDPOINT_URL',
  'OPENAPI_METHOD',
  'OPENAPI_AUTH_TYPE',
  'OPENAPI_AUTH_VALUE',
  'OPENAPI_AUTH_HEADER_NAME',
  'OPENAPI_HEADERS_JSON',
  'OPENAPI_MESSAGE_FIELD',
  'OPENAPI_RESPONSE_FIELD',

  'WS_CHAT_URL',
  'WS_CHAT_AUTH_HEADER_NAME',
  'WS_CHAT_AUTH_HEADER_VALUE',
  'WS_CHAT_SUBPROTOCOL',
  'WS_CHAT_INIT_JSON',
  'WS_CHAT_SEND_TEMPLATE',
  'WS_CHAT_AGENT_EVENT_TYPES',
  'WS_CHAT_MESSAGE_PATH',

  'EVAL_CUSTOMER_ID',
  'EVAL_CUSTOMER_NAME',
  'EVAL_RESPONSE_TIMEOUT_SECONDS',
  'VOICE_INITIAL_GREETING_TIMEOUT_MS',
  'VOICE_GREETING_FOLLOWUP_TIMEOUT_MS',
  'VOICE_PRE_SEND_DELAY_MS',
  'VOICE_PRE_SEND_GUARD_TIMEOUT_MS',
  'VOICE_TURN_SETTLE_TIMEOUT_MS',
  'VOICE_TURN_SETTLE_MAX_MS',
  'VOICE_MAX_CONSECUTIVE_SILENT_WAITS',
  'VOICE_SILENT_WAIT_FOLLOWUP_PROMPT',
] as const;

type EditableSettingKey = typeof EDITABLE_SETTING_KEYS[number];
type SettingsMap = Partial<Record<EditableSettingKey, string>>;

export const SECRET_SETTING_KEYS = new Set<EditableSettingKey>([
  'AZURE_DIRECT_LINE_SECRET',
  'STRANDS_AUTH_BEARER',
  'COPILOT_DIRECT_LINE_SECRET',
  'CUSTOM_CHAT_AUTH_BEARER',
  'DEEPGRAM_API_KEY',
  'CUSTOM_VOICE_WS_AUTH_HEADER_VALUE',
  'OPENAPI_AUTH_VALUE',
  'WS_CHAT_AUTH_HEADER_VALUE',
  'AZURE_OPENAI_AGENT_API_KEY',
  // Cross-vendor judge provider API keys
  'OPENAI_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'HUGGINGFACE_TOKEN',
  'NOTIFY_WEBHOOK_SECRET',
]);

// The deployment's tenant (process env) keys the shared settings row. For a
// per-tenant ECS service all its tasks share this id; "" for local/non-SaaS.
const PROCESS_TENANT = process.env['TENANT_ID']?.trim() ?? '';

function parseOverrides(raw: string): SettingsMap {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const out: SettingsMap = {};
  for (const key of EDITABLE_SETTING_KEYS) {
    const value = parsed[key];
    if (typeof value === 'string' && value.trim()) out[key] = value;
  }
  return out;
}

// Synchronous read of the local file cache — kept in sync with the DB by
// loadSettingsFromDb() (startup + periodic) and writeOverrides() (write-through).
function readOverrides(): SettingsMap {
  if (!existsSync(SETTINGS_FILE)) return {};
  try {
    return parseOverrides(readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function writeFileCache(overrides: SettingsMap): void {
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(overrides, null, 2), 'utf-8');
}

// Write-through: update the local read cache immediately, then persist to the
// shared DB row so a tenant's other tasks converge on the next refresh. The DB
// write is best-effort (the file write already made it locally effective).
async function writeOverrides(overrides: SettingsMap): Promise<void> {
  writeFileCache(overrides);
  try {
    const json = JSON.stringify(overrides);
    await prisma.runtimeSettings.upsert({
      where: { tenantId: PROCESS_TENANT },
      update: { json },
      create: { tenantId: PROCESS_TENANT, json },
    });
  } catch (err) {
    console.error(`[settings] Failed to persist settings to DB: ${(err as Error).message}`);
  }
}

// Refresh the local file cache from the shared DB row (call at startup and on a
// periodic timer so changes made on other tasks propagate). On first run with a
// legacy local file and no DB row, migrate the file into the DB.
export async function loadSettingsFromDb(): Promise<void> {
  try {
    const row = await prisma.runtimeSettings.findUnique({ where: { tenantId: PROCESS_TENANT } });
    if (row) {
      writeFileCache(parseOverrides(row.json));
    } else if (existsSync(SETTINGS_FILE)) {
      await writeOverrides(readOverrides());
    }
  } catch (err) {
    console.error(`[settings] Failed to load settings from DB: ${(err as Error).message}`);
  }
}

export function getEffectiveSettings(): Record<EditableSettingKey, string> {
  const overrides = readOverrides();
  const effective = {} as Record<EditableSettingKey, string>;
  for (const key of EDITABLE_SETTING_KEYS) {
    effective[key] = overrides[key] ?? process.env[key] ?? '';
  }
  return effective;
}

export function getVisibleSettings(): Record<EditableSettingKey, string> {
  const effective = getEffectiveSettings();
  const visible = {} as Record<EditableSettingKey, string>;
  for (const key of EDITABLE_SETTING_KEYS) {
    const value = effective[key];
    visible[key] = SECRET_SETTING_KEYS.has(key) && value ? REDACTED_SECRET_VALUE : value;
  }
  return visible;
}

export function getRuntimeSettingsEnv(): Record<string, string> {
  const effective = getEffectiveSettings();
  const out: Record<string, string> = {};
  for (const key of EDITABLE_SETTING_KEYS) {
    if (effective[key]) out[key] = effective[key];
  }
  return out;
}

export interface JudgeRuntimeConfig {
  modelId: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
}

function parseNumberSetting(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getJudgeRuntimeConfig(): JudgeRuntimeConfig {
  const effective = getEffectiveSettings();
  const region = (
    effective['JUDGE_BEDROCK_REGION']?.trim() ||
    process.env['BEDROCK_REGION'] ||
    effective['AWS_REGION'] ||
    'eu-west-2'
  ).trim();
  
  // Get bare model ID from settings (could be bare or region-prefixed)
  let presetModelId = effective['JUDGE_MODEL_ID']?.trim() || DEFAULT_JUDGE_MODEL_ID;
  presetModelId = extractBareModelId(presetModelId);
  
  let customModelId = effective['JUDGE_CUSTOM_MODEL_ID']?.trim() || '';
  customModelId = extractBareModelId(customModelId);
  
  const useCustom = (effective['JUDGE_USE_CUSTOM_MODEL_ID']?.trim().toLowerCase() ?? '') === 'true'
    || (!effective['JUDGE_USE_CUSTOM_MODEL_ID'] && customModelId !== '');
  
  // Use the appropriate model ID
  let bareModelId = useCustom && customModelId ? customModelId : presetModelId;
  
  // Format for the region (adds prefix if cross-region)
  const modelId = formatModelIdForRegion(bareModelId, region);
  
  console.log(`[Settings] Judge config - region: ${region}, preset: ${presetModelId}, custom: ${customModelId}, useCustom: ${useCustom}, final: ${modelId}`);
  return {
    modelId,
    temperature: parseNumberSetting(effective['JUDGE_TEMPERATURE'], Number(DEFAULT_JUDGE_TEMPERATURE)),
    maxTokens: Math.max(1, Math.round(parseNumberSetting(effective['JUDGE_MAX_TOKENS'], Number(DEFAULT_JUDGE_MAX_TOKENS)))),
    systemPrompt: effective['JUDGE_SYSTEM_PROMPT']?.trim() || DEFAULT_JUDGE_SYSTEM_PROMPT,
  };
}

/**
 * Resolve the active judge committee.
 *
 * Resolution order:
 *   1. JUDGE_COMMITTEE JSON (explicit committee) — validated; on parse error,
 *      log and fall back to the default committee.
 *   2. Default 3-judge cross-vendor committee seeded from the legacy single-judge
 *      settings (JUDGE_MODEL_ID / temperature / maxTokens / systemPrompt),
 *      filtered to providers that actually have credentials.
 * Every judge spec is normalised so temperature/maxTokens are populated.
 */
export function getJudgeCommitteeConfig(): JudgeCommitteeConfig {
  const base = getJudgeRuntimeConfig();
  const effective = getEffectiveSettings();
  const systemPrompt = base.systemPrompt;
  const threshold = parseNumberSetting(
    effective['JUDGE_DISAGREEMENT_THRESHOLD'],
    DEFAULT_DISAGREEMENT_THRESHOLD,
  );
  const bareGeneralist = extractBareModelId(base.modelId);

  let committee: JudgeCommitteeConfig;
  const raw = effective['JUDGE_COMMITTEE']?.trim();
  if (raw) {
    try {
      committee = parseCommitteeJson(raw, systemPrompt);
    } catch (err) {
      console.warn(
        `[Settings] Invalid JUDGE_COMMITTEE — using default committee. ${(err as Error).message}`,
      );
      committee = buildDefaultCommittee({
        bedrockModelId: bareGeneralist,
        systemPrompt,
        temperature: base.temperature,
        maxTokens: base.maxTokens,
        disagreementThreshold: threshold,
        availableProviders: availableProviders(),
      });
    }
  } else {
    committee = buildDefaultCommittee({
      bedrockModelId: bareGeneralist,
      systemPrompt,
      temperature: base.temperature,
      maxTokens: base.maxTokens,
      disagreementThreshold: threshold,
      availableProviders: availableProviders(),
    });
  }

  committee.judges = committee.judges.map((j) => ({
    ...j,
    temperature: j.temperature ?? base.temperature,
    maxTokens: j.maxTokens ?? base.maxTokens,
  }));

  // Plan-based cost gating: cap committee size to the tenant's allowance.
  committee.judges = capCommittee(committee.judges, getUsageLimits().maxJudges);
  return committee;
}

export function isJudgeWeightingEnabled(): boolean {
  return (getEffectiveSettings()['JUDGE_WEIGHTING_ENABLED']?.trim().toLowerCase() ?? '') === 'true';
}

/**
 * Resolve the outbound-notification config from runtime settings (falling back
 * to process env for headless deployments). Returns null when notifications
 * are unconfigured — callers pass the result straight to sendNotification().
 */
export function getNotifierConfig(): NotifierConfig | null {
  const effective = getEffectiveSettings();
  return parseNotifierConfig({
    webhookUrl: effective['NOTIFY_WEBHOOK_URL'] || process.env['NOTIFY_WEBHOOK_URL'],
    events: effective['NOTIFY_EVENTS'] || process.env['NOTIFY_EVENTS'],
    secret: effective['NOTIFY_WEBHOOK_SECRET'] || process.env['NOTIFY_WEBHOOK_SECRET'],
  });
}

export interface CalibrationThresholds {
  trusted: number;
  min: number;
  minSamples: number;
}

export function getCalibrationThresholds(): CalibrationThresholds {
  const effective = getEffectiveSettings();
  return {
    trusted: parseNumberSetting(effective['JUDGE_KAPPA_TRUSTED'], 0.8),
    min: parseNumberSetting(effective['JUDGE_KAPPA_MIN'], 0.6),
    minSamples: Math.max(1, Math.round(parseNumberSetting(effective['JUDGE_CALIBRATION_MIN_SAMPLES'], 20))),
  };
}

export async function saveSettings(partial: Record<string, unknown>): Promise<Record<EditableSettingKey, string>> {
  const current = readOverrides();
  const next = { ...current };
  
  // Validate JUDGE_MODEL_ID if being changed
  if ('JUDGE_MODEL_ID' in partial) {
    const raw = partial['JUDGE_MODEL_ID'];
    const modelId = typeof raw === 'string' ? raw.trim() : '';
    if (modelId && !isKnownJudgeModel(modelId)) {
      throw new Error(`Invalid judge model ID: ${modelId}. Model must be from the available list.`);
    }
  }

  // Validate JUDGE_COMMITTEE JSON if being changed (empty clears it).
  if ('JUDGE_COMMITTEE' in partial) {
    const raw = partial['JUDGE_COMMITTEE'];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value) {
      try {
        parseCommitteeJson(value, DEFAULT_JUDGE_SYSTEM_PROMPT);
      } catch (err) {
        throw new Error(`Invalid JUDGE_COMMITTEE config: ${(err as Error).message}`);
      }
    }
  }
  
  for (const key of EDITABLE_SETTING_KEYS) {
    if (!(key in partial)) continue;
    const raw = partial[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (SECRET_SETTING_KEYS.has(key) && value === REDACTED_SECRET_VALUE) continue;
    if (!value) delete next[key];
    else next[key] = value;
  }
  await writeOverrides(next);
  return getEffectiveSettings();
}
