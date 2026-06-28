import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import {
  PROVIDER_DEFS,
  RUN_PROVIDERS,
  MAX_INSTANCES_PER_PROVIDER,
  type RunProvider,
} from '../../shared/provider-fields.js';
import {
  fetchProviderInstances,
  createProviderInstance,
  updateProviderInstance,
  deleteProviderInstance,
  type ProviderInstance,
} from '../lib/provider-instances.js';
import {
  DEFAULT_JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_MODEL_ID,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  DEFAULT_JUDGE_TEMPERATURE,
  LEGACY_JUDGE_SYSTEM_PROMPTS,
} from '../../shared/judge-config.js';
import {
  BrandAwsIcon,
  BrandMicrosoftIcon,
  BrandOpenApiIcon,
  ProviderAwsIcon,
  ProviderBotIcon,
  ProviderChatIcon,
  ProviderDefaultsIcon,
  ProviderGlobeIcon,
  ProviderMicrosoftIcon,
  ProviderOpenApiIcon,
  ProviderShieldIcon,
  ProviderTimingIcon,
  ProviderVoiceIcon,
  ProviderWebSocketIcon,
  RunFailIcon,
  RunPassIcon,
} from '../components/icons.js';

type SettingsMap = Record<string, string>;

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
}


const JUDGE_MODEL_FIELD_KEY = 'JUDGE_MODEL_ID';
const JUDGE_CUSTOM_MODEL_FIELD_KEY = 'JUDGE_CUSTOM_MODEL_ID';
const JUDGE_USE_CUSTOM_MODEL_FIELD_KEY = 'JUDGE_USE_CUSTOM_MODEL_ID';
const JUDGE_TEMPERATURE_FIELD_KEY = 'JUDGE_TEMPERATURE';
const JUDGE_MAX_TOKENS_FIELD_KEY = 'JUDGE_MAX_TOKENS';
const JUDGE_SYSTEM_PROMPT_FIELD_KEY = 'JUDGE_SYSTEM_PROMPT';
const JUDGE_REGION_FIELD_KEY = 'JUDGE_BEDROCK_REGION';
const JUDGE_SETTING_KEYS = [
  JUDGE_MODEL_FIELD_KEY,
  JUDGE_CUSTOM_MODEL_FIELD_KEY,
  JUDGE_USE_CUSTOM_MODEL_FIELD_KEY,
  JUDGE_TEMPERATURE_FIELD_KEY,
  JUDGE_MAX_TOKENS_FIELD_KEY,
  JUDGE_SYSTEM_PROMPT_FIELD_KEY,
  JUDGE_REGION_FIELD_KEY,
] as const;

interface GeneralSectionDef {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  fields: FieldDef[];
}

const PROVIDER_OPTIONS = [
  { value: 'connect',   label: 'Amazon Connect' },
  { value: 'lex',       label: 'Amazon Lex' },
  { value: 'azure',     label: 'Azure Bot (Direct Line)' },
  { value: 'azure-openai', label: 'Azure OpenAI' },
  { value: 'strands',   label: 'Strands / AgentCore' },
  { value: 'copilot',   label: 'Microsoft Copilot' },
  { value: 'custom',    label: 'Custom Chat' },
  { value: 'openapi',   label: 'OpenAPI' },
  { value: 'websocket', label: 'WebSocket Chat (ws/wss)' },
];

function normalizeJudgeSettings(settings: SettingsMap): SettingsMap {
  const next = { ...settings };
  const modelId = next[JUDGE_MODEL_FIELD_KEY]?.trim() || DEFAULT_JUDGE_MODEL_ID;
  next[JUDGE_MODEL_FIELD_KEY] = modelId;
  next[JUDGE_TEMPERATURE_FIELD_KEY] = next[JUDGE_TEMPERATURE_FIELD_KEY]?.trim() || DEFAULT_JUDGE_TEMPERATURE;
  next[JUDGE_MAX_TOKENS_FIELD_KEY] = next[JUDGE_MAX_TOKENS_FIELD_KEY]?.trim() || DEFAULT_JUDGE_MAX_TOKENS;
  const prompt = next[JUDGE_SYSTEM_PROMPT_FIELD_KEY]?.trim();
  next[JUDGE_SYSTEM_PROMPT_FIELD_KEY] =
    !prompt || LEGACY_JUDGE_SYSTEM_PROMPTS.includes(prompt) ? DEFAULT_JUDGE_SYSTEM_PROMPT : prompt;
  const customModel = next[JUDGE_CUSTOM_MODEL_FIELD_KEY]?.trim() || '';
  if (next[JUDGE_USE_CUSTOM_MODEL_FIELD_KEY] == null) {
    next[JUDGE_USE_CUSTOM_MODEL_FIELD_KEY] = customModel ? 'true' : 'false';
  }
  return next;
}

function getJudgeSettingsSignature(settings: SettingsMap): string {
  return JUDGE_SETTING_KEYS
    .map((key) => `${key}=${settings[key] ?? ''}`)
    .join('\u001f');
}

// ── Non-provider (general) sections ──────────────────────────────────────────

const GENERAL_SECTIONS: GeneralSectionDef[] = [
  {
    id: 'eval-defaults',
    title: 'Evaluation Defaults',
    icon: ProviderDefaultsIcon,
    description: 'Default values used for every evaluation run when not overridden by scenario settings.',
    fields: [
      {
        key: 'EVAL_CUSTOMER_ID',
        label: 'Customer ID',
        placeholder: 'CUST-001',
        hint: 'Synthetic customer ID included in the conversation context sent to the agent. Used to simulate an authenticated customer.',
      },
      {
        key: 'EVAL_CUSTOMER_NAME',
        label: 'Customer Name',
        placeholder: 'James Wilson',
        hint: 'Synthetic customer name used in scenario greetings and context prompts.',
      },
      {
        key: 'EVAL_RESPONSE_TIMEOUT_SECONDS',
        label: 'Turn Timeout (seconds)',
        placeholder: '120',
        hint: 'Maximum seconds to wait for the agent to respond to each turn. Increase for slow or streaming endpoints. Defaults to 120.',
      },
    ],
  },
  {
    id: 'voice-timing',
    title: 'Voice Timing',
    icon: ProviderTimingIcon,
    description: 'Fine-tune WebRTC / WebSocket voice session pacing. Only relevant when running voice evaluations.',
    fields: [
      {
        key: 'VOICE_INITIAL_GREETING_TIMEOUT_MS',
        label: 'Initial Greeting Timeout (ms)',
        placeholder: '120000',
        hint: 'Milliseconds to wait for the agent\'s opening greeting after the call connects. Defaults to 120000 (2 min).',
      },
      {
        key: 'VOICE_GREETING_FOLLOWUP_TIMEOUT_MS',
        label: 'Greeting Follow-up Timeout (ms)',
        placeholder: '6000',
        hint: 'Extra wait after the greeting before sending the first evaluation turn. Allows the agent to fully finish speaking.',
      },
      {
        key: 'VOICE_PRE_SEND_DELAY_MS',
        label: 'Pre-send Delay (ms)',
        placeholder: '1200',
        hint: 'Delay before injecting each voice turn to simulate a human\'s natural speech onset pause. Defaults to 1200 ms.',
      },
      {
        key: 'VOICE_PRE_SEND_GUARD_TIMEOUT_MS',
        label: 'Pre-send Guard Timeout (ms)',
        placeholder: '4000',
        hint: 'Time to wait after the agent\'s last utterance before sending the next turn, to avoid interrupting mid-speech.',
      },
      {
        key: 'VOICE_TURN_SETTLE_TIMEOUT_MS',
        label: 'Turn Settle Poll (ms)',
        placeholder: '4000',
        hint: 'Polling interval while waiting for a voice turn to fully settle (agent stops speaking). Defaults to 4000 ms.',
      },
      {
        key: 'VOICE_TURN_SETTLE_MAX_MS',
        label: 'Turn Settle Max (ms)',
        placeholder: '15000',
        hint: 'Maximum total time to wait for a voice turn to settle before treating it as complete. Defaults to 15000 ms.',
      },
      {
        key: 'VOICE_MAX_CONSECUTIVE_SILENT_WAITS',
        label: 'Max Silent Wait Cycles',
        placeholder: '1',
        hint: 'How many consecutive silence timeout cycles to allow before giving up on a turn and moving on. Defaults to 1.',
      },
      {
        key: 'VOICE_SILENT_WAIT_FOLLOWUP_PROMPT',
        label: 'Silent Wait Follow-up Prompt',
        placeholder: 'Are you still there?',
        hint: 'Message sent back to the agent when it falls silent, to prompt it to continue the conversation.',
      },
    ],
  },
];

// ── Tooltip ───────────────────────────────────────────────────────────────────

function HintTooltip({ hint }: { hint: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold leading-none flex items-center justify-center hover:bg-blue-100 hover:text-blue-700 transition-colors focus:outline-none"
        aria-label="Help"
      >
        ?
      </button>
      {show && (
        <div className="absolute z-50 left-5 top-0 w-64 bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl leading-relaxed pointer-events-none">
          {hint}
          <div className="absolute left-[-4px] top-2 w-2 h-2 bg-slate-800 rotate-45" />
        </div>
      )}
    </span>
  );
}

// ── Field renderer ────────────────────────────────────────────────────────────

function SettingsField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
        {field.label}
        {field.required ? (
          <span className="text-red-500 font-bold" title="Required">*</span>
        ) : (
          <span className="text-[10px] text-slate-400 font-normal border border-slate-200 rounded px-1 py-0.5 leading-none">optional</span>
        )}
        {field.hint && <HintTooltip hint={field.hint} />}
      </span>
      <input
        type={field.sensitive ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        autoComplete={field.sensitive ? 'off' : undefined}
        className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          field.required && !value
            ? 'border-orange-300 bg-orange-50/30'
            : 'border-slate-200'
        }`}
      />
      {field.required && !value && (
        <span className="text-[10px] text-orange-500">This field is required to use this provider</span>
      )}
    </label>
  );
}

// ── Judge committee (cross-vendor) ─────────────────────────────────────────────

const JUDGE_PROVIDER_FIELDS: FieldDef[] = [
  { key: 'OPENAI_API_KEY', label: 'OpenAI API key', placeholder: 'sk-...', sensitive: true, hint: 'Activates a GPT-class judge (the default committee\'s cross-vendor slot). Stored in Secrets Manager in production.' },
  { key: 'OPENAI_BASE_URL', label: 'OpenAI base URL (optional)', placeholder: 'https://api.openai.com/v1', hint: 'Override for OpenAI-compatible gateways. Leave blank for the default.' },
  { key: 'AZURE_OPENAI_API_KEY', label: 'Azure OpenAI key', placeholder: 'xxxxxxxx', sensitive: true, hint: 'Use GPT models via an Azure OpenAI deployment.' },
  { key: 'AZURE_OPENAI_ENDPOINT', label: 'Azure OpenAI endpoint', placeholder: 'https://<resource>.openai.azure.com', hint: 'Required to enable the Azure OpenAI judge provider.' },
  { key: 'AZURE_OPENAI_API_VERSION', label: 'Azure API version', placeholder: '2024-10-21', hint: 'Azure OpenAI API version. Defaults to 2024-10-21.' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', placeholder: 'sk-ant-...', sensitive: true, hint: 'Run Claude as a judge via the direct Anthropic API (outside Bedrock).' },
  { key: 'GEMINI_API_KEY', label: 'Google Gemini API key', placeholder: 'xxxxxxxx', sensitive: true, hint: 'Adds a Gemini judge — a third architecture family for ensembles.' },
  { key: 'HUGGINGFACE_TOKEN', label: 'HuggingFace token (calibration import)', placeholder: 'hf_...', sensitive: true, hint: 'Enables the "Import from LMSYS" button on the Calibration page to fetch the gated LMSYS Chatbot Arena pairwise dataset. Create a free token at huggingface.co/settings/tokens and accept the dataset terms.' },
];

// ── Provider instances ────────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<RunProvider, React.ComponentType<{ className?: string }>> = {
  connect: ProviderAwsIcon,
  lex: ProviderAwsIcon,
  azure: ProviderMicrosoftIcon,
  'azure-openai': ProviderMicrosoftIcon,
  strands: ProviderAwsIcon,
  copilot: ProviderMicrosoftIcon,
  custom: ProviderChatIcon,
  openapi: ProviderOpenApiIcon,
  websocket: ProviderWebSocketIcon,
};

interface InstanceEditorState {
  providerType: RunProvider;
  id: string | null;
  nickname: string;
  config: Record<string, string>;
}

function instanceSummary(inst: ProviderInstance): string {
  const def = PROVIDER_DEFS[inst.providerType];
  const parts: string[] = [];
  for (const field of def.fields) {
    if (field.sensitive) continue;
    const v = inst.config[field.key];
    if (v) parts.push(`${field.label}: ${v}`);
    if (parts.length >= 2) break;
  }
  return parts.join('  ·  ') || 'No fields set yet';
}

function ProviderInstancesManager() {
  const [instances, setInstances] = useState<ProviderInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<InstanceEditorState | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setInstances(await fetchProviderInstances());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  function startCreate(type: RunProvider): void {
    setError(null);
    setEditor({ providerType: type, id: null, nickname: '', config: {} });
  }
  function startEdit(inst: ProviderInstance): void {
    setError(null);
    setEditor({ providerType: inst.providerType, id: inst.id, nickname: inst.nickname, config: { ...inst.config } });
  }

  async function saveEditor(): Promise<void> {
    if (!editor) return;
    if (!editor.nickname.trim()) { setError('Nickname is required'); return; }
    setBusy(true);
    setError(null);
    try {
      if (editor.id) {
        await updateProviderInstance(editor.id, { nickname: editor.nickname, config: editor.config });
      } else {
        await createProviderInstance({ providerType: editor.providerType, nickname: editor.nickname, config: editor.config });
      }
      setEditor(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removeInstance(inst: ProviderInstance): Promise<void> {
    if (!window.confirm(`Delete provider instance "${inst.nickname}"? Runs that reference it will fail until you re-select an instance.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProviderInstance(inst.id);
      if (editor?.id === inst.id) setEditor(null);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(inst: ProviderInstance): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await updateProviderInstance(inst.id, { isDefault: true });
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card text-sm text-slate-400">Loading provider instances…</div>;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200/80 bg-white">
        <div className="flex items-center gap-2">
          <ProviderDefaultsIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-base text-slate-900">Provider Instances</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Configure up to {MAX_INSTANCES_PER_PROVIDER} named connections per provider type. Select an instance
              when launching runs or scheduling them.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-5 py-2 bg-red-50 border-b border-red-100 text-sm text-red-600 flex items-center gap-1">
          <RunFailIcon className="h-4 w-4" aria-hidden="true" /> {error}
        </div>
      )}

      <div className="divide-y divide-slate-100">
        {RUN_PROVIDERS.map((type) => {
          const def = PROVIDER_DEFS[type];
          const Icon = PROVIDER_ICONS[type];
          const list = instances.filter((i) => i.providerType === type);
          const atMax = list.length >= MAX_INSTANCES_PER_PROVIDER;
          const editingHere = editor?.providerType === type;
          return (
            <div key={type} className="px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="text-sm font-semibold text-slate-800">{def.label}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium">
                    {list.length}/{MAX_INSTANCES_PER_PROVIDER}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => startCreate(type)}
                  disabled={atMax || (editingHere && editor?.id === null)}
                  className="text-xs font-medium rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
                  title={atMax ? `Limit of ${MAX_INSTANCES_PER_PROVIDER} reached` : undefined}
                >
                  + Add instance
                </button>
              </div>

              {list.length === 0 && !editingHere && (
                <p className="mt-2 text-xs text-slate-400">No instances yet. Add one to evaluate {def.label}.</p>
              )}

              {list.length > 0 && (
                <div className="mt-3 space-y-2">
                  {list.map((inst) => (
                    <div key={inst.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-800 truncate">{inst.nickname}</span>
                          {inst.isDefault && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">default</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 truncate">{instanceSummary(inst)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!inst.isDefault && (
                          <button type="button" onClick={() => void makeDefault(inst)} disabled={busy} className="text-[11px] text-slate-500 hover:text-blue-700 disabled:opacity-40">Set default</button>
                        )}
                        <button type="button" onClick={() => startEdit(inst)} className="text-[11px] text-slate-500 hover:text-slate-900">Edit</button>
                        <button type="button" onClick={() => void removeInstance(inst)} disabled={busy} className="text-[11px] text-red-500 hover:text-red-700 disabled:opacity-40">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {editingHere && editor && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">{def.description}</p>
                  <label className="flex flex-col gap-1 mb-3 max-w-sm">
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                      Nickname <span className="text-red-500 font-bold" title="Required">*</span>
                    </span>
                    <input
                      value={editor.nickname}
                      onChange={(e) => setEditor({ ...editor, nickname: e.target.value })}
                      placeholder="e.g. Production bot, Staging, EU instance"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-slate-200"
                    />
                  </label>
                  <div className="grid md:grid-cols-2 gap-3">
                    {def.fields.map((field) => (
                      <SettingsField
                        key={field.key}
                        field={field}
                        value={editor.config[field.key] ?? ''}
                        onChange={(val) => setEditor({ ...editor, config: { ...editor.config, [field.key]: val } })}
                      />
                    ))}
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button type="button" onClick={() => void saveEditor()} disabled={busy} className="btn-primary text-sm disabled:opacity-50">
                      {busy ? 'Saving…' : editor.id ? 'Save changes' : 'Create instance'}
                    </button>
                    <button type="button" onClick={() => setEditor(null)} disabled={busy} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function JudgeCommitteeSection({
  settings,
  onUpdate,
}: {
  settings: SettingsMap;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const threshold = settings['JUDGE_DISAGREEMENT_THRESHOLD'] ?? '2';
  const committee = settings['JUDGE_COMMITTEE'] ?? '';

  return (
    <section className="card space-y-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Judge Committee</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Cross-vendor judges &amp; disagreement</h3>
          <p className="mt-1 text-sm text-slate-500">
            By default ARIA runs a 3-judge cross-vendor committee (Claude + GPT + Nova). Judges whose provider
            has no credentials are skipped automatically — add a key below to activate them. Scores are the
            committee mean; large disagreements are flagged on results.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
          {open ? 'Collapse' : 'Expand'}
        </span>
      </button>

      {open ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {JUDGE_PROVIDER_FIELDS.map((field) => (
              <SettingsField
                key={field.key}
                field={field}
                value={settings[field.key] ?? ''}
                onChange={(val) => onUpdate(field.key, val)}
              />
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
              Disagreement threshold (0–10)
              <HintTooltip hint="Judges are flagged as disagreeing on a dimension when their score range (max − min) exceeds this value. Default 2." />
            </span>
            <input
              type="number"
              min="0"
              max="10"
              step="0.5"
              value={threshold}
              onChange={(e) => onUpdate('JUDGE_DISAGREEMENT_THRESHOLD', e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
              Advanced: committee JSON
              <HintTooltip hint='Optional. Define an explicit committee, e.g. {"judges":[{"id":"a","provider":"bedrock","modelId":"anthropic.claude-sonnet-4-5-20250929-v1:0"},{"id":"b","provider":"openai","modelId":"gpt-4o"}],"disagreementThreshold":2}. Leave blank to use the default committee.' />
            </span>
            <textarea
              rows={8}
              value={committee}
              onChange={(e) => onUpdate('JUDGE_COMMITTEE', e.target.value)}
              placeholder='Leave blank for the default committee, or paste {"judges":[…],"disagreementThreshold":2}'
              className="min-h-[140px] font-mono text-xs leading-6"
            />
          </label>
        </>
      ) : null}
    </section>
  );
}

// ── General section ───────────────────────────────────────────────────────────

function GeneralSection({
  section,
  settings,
  onUpdate,
}: {
  section: GeneralSectionDef;
  settings: SettingsMap;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <section.icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <h3 className="font-semibold text-slate-900">{section.title}</h3>
        </div>
        <span
          className="text-slate-400 transition-transform duration-200"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-4">
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">{section.description}</p>
          <div className="grid md:grid-cols-2 gap-3">
            {section.fields.map((field) => (
              <SettingsField
                key={field.key}
                field={field}
                value={settings[field.key] ?? ''}
                onChange={(val) => onUpdate(field.key, val)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const savedJudgeSettingsSignatureRef = useRef<string>('');
  const loadedJudgeSettingsSignatureRef = useRef<string>('');

  useEffect(() => {
    apiFetch('/api/settings')
      .then((d: { settings: SettingsMap }) => {
        setSettings(normalizeJudgeSettings(d.settings ?? {}));
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (loading) return;
    const signature = getJudgeSettingsSignature(settings);
    loadedJudgeSettingsSignatureRef.current ||= signature;
    savedJudgeSettingsSignatureRef.current ||= signature;
  }, [loading, settings]);

  function updateValue(key: string, value: string): void {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save(nextSettings: SettingsMap = settings, showConfirmation = true): Promise<void> {
    setSaving(true);
    setError(null);
    if (showConfirmation) setMessage(null);
    try {
      const d = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings: nextSettings }),
      }) as { settings: SettingsMap };
      const normalized = normalizeJudgeSettings(d.settings ?? nextSettings);
      setSettings(normalized);
      const signature = getJudgeSettingsSignature(normalized);
      savedJudgeSettingsSignatureRef.current = signature;
      loadedJudgeSettingsSignatureRef.current = signature;
      if (showConfirmation) {
        setMessage('Settings saved. New runs will use these values immediately.');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const judgeSettingsSignature = useMemo(() => getJudgeSettingsSignature(settings), [settings]);

  useEffect(() => {
    if (loading || saving) return;
    if (!loadedJudgeSettingsSignatureRef.current) return;
    if (judgeSettingsSignature === savedJudgeSettingsSignatureRef.current) return;

    const timeout = window.setTimeout(() => {
      if (judgeSettingsSignature !== savedJudgeSettingsSignatureRef.current) {
        void save(settings, false);
      }
    }, 750);

    return () => window.clearTimeout(timeout);
  }, [judgeSettingsSignature, loading, saving, settings]);

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading settings…</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200/80 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 px-6 py-7 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">Administration</p>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h2>
          <p className="text-sm leading-6 text-slate-200/80">
            Configure providers and runtime parameters. Changes take effect immediately — no redeploy required.
            Fields marked <span className="font-bold text-cyan-200">*</span> are required for the provider to function.
          </p>
        </div>
      </section>

      <JudgeCommitteeSection settings={settings} onUpdate={updateValue} />

      {/* Default provider type */}
      <div className="card">
        <label className="flex flex-col gap-1 max-w-xs">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
            Default Provider
            <HintTooltip hint="The provider type pre-selected when starting a new run. Can be overridden per-run in the New Run modal." />
          </span>
          <select
            value={settings['EVAL_PROVIDER_DEFAULT'] ?? 'connect'}
            onChange={(e) => updateValue('EVAL_PROVIDER_DEFAULT', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </label>
        <p className="mt-3 text-xs text-slate-500">Sets the pre-selected provider type in the New Run modal and Scenarios page. Configure named connections per type below.</p>
      </div>

      {/* Provider instances */}
      <ProviderInstancesManager />

      {/* General sections */}
      {GENERAL_SECTIONS.map((section) => (
        <GeneralSection
          key={section.id}
          section={section}
          settings={settings}
          onUpdate={updateValue}
        />
      ))}

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={() => { void save(settings, true); }}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && (
          <span className="inline-flex items-center gap-1 text-sm text-red-600">
            <RunFailIcon className="h-4 w-4" aria-hidden="true" />
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
