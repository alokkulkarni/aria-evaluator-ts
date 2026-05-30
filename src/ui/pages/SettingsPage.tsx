import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.js';

type SettingsMap = Record<string, string>;

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
}

interface SectionDef {
  section: string;
  collapsible: boolean;
  defaultOpen?: boolean;
  fields: FieldDef[];
}

const PROVIDER_OPTIONS = [
  { value: 'connect',  label: 'Amazon Connect' },
  { value: 'lex',      label: 'Amazon Lex' },
  { value: 'azure',    label: 'Azure Bot (Direct Line)' },
  { value: 'strands',  label: 'Strands / AgentCore' },
  { value: 'copilot',  label: 'Microsoft Copilot' },
  { value: 'custom',   label: 'Custom Chat' },
  { value: 'openapi',  label: 'OpenAPI' },
];

const FIELDS: SectionDef[] = [
  {
    section: 'Provider Defaults',
    collapsible: false,
    fields: [
      { key: 'EVAL_PROVIDER_DEFAULT', label: 'Default Provider' },
    ],
  },
  {
    section: 'Amazon Connect',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'CONNECT_INSTANCE_ID', label: 'Connect Instance ID' },
      { key: 'CONNECT_REGION', label: 'Connect Region', placeholder: 'eu-west-2' },
      { key: 'AWS_REGION', label: 'AWS Region (override)', placeholder: 'eu-west-2' },
      { key: 'CONNECT_CONTACT_FLOW', label: 'Contact Flow ID/ARN (chat)' },
      { key: 'CONNECT_CONTACT_FLOW_NAME', label: 'Contact Flow Name (chat fallback)' },
      { key: 'CONNECT_WEBRTC_FLOW_ID', label: 'WebRTC Flow ID (voice)' },
      { key: 'CONNECT_WEBRTC_CONNECT_ATTEMPTS', label: 'WebRTC Connect Attempts', placeholder: '2' },
      { key: 'CONNECT_PHONE_NUMBER', label: 'Phone Number (optional)' },
    ],
  },
  {
    section: 'Amazon Lex',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'LEX_BOT_ID', label: 'Lex Bot ID' },
      { key: 'LEX_BOT_ALIAS_ID', label: 'Lex Bot Alias ID' },
      { key: 'LEX_BOT_LOCALE_ID', label: 'Lex Bot Locale ID', placeholder: 'en_GB' },
      { key: 'LEX_REGION', label: 'Lex Region', placeholder: 'eu-west-2' },
    ],
  },
  {
    section: 'Azure Bot (Direct Line)',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'AZURE_DIRECT_LINE_SECRET', label: 'Direct Line Secret' },
      { key: 'AZURE_DIRECT_LINE_ENDPOINT', label: 'Direct Line Endpoint', placeholder: 'https://directline.botframework.com/v3/directline' },
      { key: 'AZURE_DIRECT_LINE_USER_ID', label: 'User ID (optional)', placeholder: 'aria-evaluator-user' },
    ],
  },
  {
    section: 'Custom Chat Provider',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'CUSTOM_CHAT_ENDPOINT', label: 'Chat Endpoint URL' },
      { key: 'CUSTOM_CHAT_METHOD', label: 'HTTP Method (POST|PUT)', placeholder: 'POST' },
      { key: 'CUSTOM_CHAT_AUTH_BEARER', label: 'Bearer Token (optional)' },
      { key: 'CUSTOM_CHAT_MESSAGE_FIELD', label: 'Request Message Field', placeholder: 'message' },
      { key: 'CUSTOM_CHAT_RESPONSE_FIELD', label: 'Response Message Field', placeholder: 'reply' },
      { key: 'CUSTOM_CHAT_HEADERS_JSON', label: 'Extra Headers JSON', placeholder: '{"X-Api-Key":"..."}' },
    ],
  },
  {
    section: 'Strands / AgentCore Chat Provider',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'STRANDS_ENDPOINT', label: 'Strands Endpoint URL' },
      { key: 'STRANDS_METHOD', label: 'HTTP Method (POST|PUT)', placeholder: 'POST' },
      { key: 'STRANDS_AUTH_TYPE', label: 'Auth Type (none|bearer|sigv4)', placeholder: 'none' },
      { key: 'STRANDS_AUTH_BEARER', label: 'Bearer Token (auth=bearer only)' },
      { key: 'STRANDS_SIGV4_REGION', label: 'SigV4 Region (auth=sigv4)', placeholder: 'eu-west-2' },
      { key: 'STRANDS_SIGV4_SERVICE', label: 'SigV4 Service (auth=sigv4)', placeholder: 'bedrock-agentcore' },
      { key: 'STRANDS_MESSAGE_FIELD', label: 'Request Message Field', placeholder: 'prompt' },
      { key: 'STRANDS_RESPONSE_FIELD', label: 'Response Field Path', placeholder: 'result' },
      { key: 'STRANDS_HISTORY_FIELD', label: 'Request History Field', placeholder: 'history' },
      { key: 'STRANDS_SESSION_ID_FIELD', label: 'Request Session ID Field', placeholder: 'sessionId' },
      { key: 'STRANDS_HEADERS_JSON', label: 'Extra Headers JSON', placeholder: '{"X-Api-Key":"..."}' },
    ],
  },
  {
    section: 'Microsoft Copilot Provider',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'COPILOT_DIRECT_LINE_SECRET', label: 'Copilot Direct Line Secret' },
      { key: 'COPILOT_DIRECT_LINE_ENDPOINT', label: 'Copilot Direct Line Endpoint', placeholder: 'https://directline.botframework.com/v3/directline' },
      { key: 'COPILOT_DIRECT_LINE_USER_ID', label: 'Copilot User ID (optional)', placeholder: 'aria-evaluator-user' },
    ],
  },
  {
    section: 'Custom Voice Provider',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'CUSTOM_VOICE_PROTOCOL', label: 'Voice Protocol (deepgram|agentcore|generic-json)', placeholder: 'deepgram' },
      { key: 'DEEPGRAM_VOICE_WS_URL', label: 'Deepgram Voice WS URL' },
      { key: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key' },
      { key: 'DEEPGRAM_VOICE_SETTINGS_JSON', label: 'Deepgram Settings JSON (optional override)' },
      { key: 'CUSTOM_VOICE_WS_URL', label: 'Generic Voice WS URL' },
      { key: 'CUSTOM_VOICE_WS_AUTH_HEADER_NAME', label: 'Generic WS Auth Header Name' },
      { key: 'CUSTOM_VOICE_WS_AUTH_HEADER_VALUE', label: 'Generic WS Auth Header Value' },
      { key: 'CUSTOM_VOICE_WS_INIT_JSON', label: 'Generic WS Init JSON' },
      { key: 'CUSTOM_VOICE_WS_SEND_TEMPLATE', label: 'Generic WS Send Template', placeholder: '{"type":"message","content":"{{message}}"}' },
      { key: 'CUSTOM_VOICE_WS_AGENT_EVENT_TYPES', label: 'Generic Agent Event Types', placeholder: 'agent,assistant,message,ConversationText' },
      { key: 'CUSTOM_VOICE_WS_MESSAGE_PATH', label: 'Generic Message Path', placeholder: 'content' },
    ],
  },
  {
    section: 'Evaluation Defaults',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'EVAL_CUSTOMER_ID', label: 'Customer ID', placeholder: 'CUST-001' },
      { key: 'EVAL_CUSTOMER_NAME', label: 'Customer Name', placeholder: 'James Wilson' },
      { key: 'EVAL_RESPONSE_TIMEOUT_SECONDS', label: 'Turn Timeout (seconds)', placeholder: '120' },
    ],
  },
  {
    section: 'OpenAPI Chat Provider',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'OPENAPI_SPEC_URL', label: 'OpenAPI Spec URL', placeholder: 'https://api.example.com/openapi.yaml' },
      { key: 'OPENAPI_ENDPOINT_URL', label: 'Chat Endpoint URL (override auto-detected)', placeholder: 'https://api.example.com/chat' },
      { key: 'OPENAPI_METHOD', label: 'HTTP Method (POST|PUT)', placeholder: 'POST' },
      { key: 'OPENAPI_AUTH_TYPE', label: 'Auth Type (none|bearer|apikey|basic)', placeholder: 'none' },
      { key: 'OPENAPI_AUTH_VALUE', label: 'Auth Value (token / user:password)', placeholder: '' },
      { key: 'OPENAPI_AUTH_HEADER_NAME', label: 'API Key Header Name (auth=apikey)', placeholder: 'X-Api-Key' },
      { key: 'OPENAPI_HEADERS_JSON', label: 'Extra Headers JSON', placeholder: '{"X-Custom":"value"}' },
      { key: 'OPENAPI_MESSAGE_FIELD', label: 'Request Message Field', placeholder: 'message' },
      { key: 'OPENAPI_RESPONSE_FIELD', label: 'Response Message Field Path', placeholder: 'reply' },
    ],
  },
  {
    section: 'Voice Timing',
    collapsible: true,
    defaultOpen: false,
    fields: [
      { key: 'VOICE_INITIAL_GREETING_TIMEOUT_MS', label: 'Initial Greeting Timeout (ms)', placeholder: '120000' },
      { key: 'VOICE_GREETING_FOLLOWUP_TIMEOUT_MS', label: 'Greeting Follow-up Timeout (ms)', placeholder: '6000' },
      { key: 'VOICE_PRE_SEND_DELAY_MS', label: 'Pre-send Delay (ms)', placeholder: '1200' },
      { key: 'VOICE_PRE_SEND_GUARD_TIMEOUT_MS', label: 'Pre-send Guard Timeout (ms)', placeholder: '4000' },
      { key: 'VOICE_TURN_SETTLE_TIMEOUT_MS', label: 'Turn Settle Poll Timeout (ms)', placeholder: '4000' },
      { key: 'VOICE_TURN_SETTLE_MAX_MS', label: 'Turn Settle Max (ms)', placeholder: '15000' },
      { key: 'VOICE_MAX_CONSECUTIVE_SILENT_WAITS', label: 'Max Silent Wait Cycles', placeholder: '1' },
      { key: 'VOICE_SILENT_WAIT_FOLLOWUP_PROMPT', label: 'Silent Wait Follow-up Prompt' },
    ],
  },
];

// ── Collapsible section wrapper ───────────────────────────────────────────────
function CollapsibleSection({
  title,
  collapsible,
  children,
}: {
  title: string;
  collapsible: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!collapsible);

  return (
    <div className="card">
      <button
        type="button"
        onClick={() => collapsible && setOpen((v) => !v)}
        className={`w-full flex items-center justify-between text-left ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}
      >
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {collapsible && (
          <span
            className="text-slate-400 transition-transform duration-200"
            style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        )}
      </button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function SettingsPage() {
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then((d: { settings: SettingsMap }) => setSettings(d.settings ?? {}))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  function updateValue(key: string, value: string): void {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const d = await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ settings }),
      }) as { settings: SettingsMap };
      setSettings(d.settings ?? settings);
      setMessage('Settings saved. New runs will use these values immediately.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading settings…</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Settings</h2>
        <p className="text-slate-500 mt-1">
          Update Connect and runtime parameters from the portal. No redeploy required.
        </p>
      </div>

      {FIELDS.map((group) => (
        <CollapsibleSection
          key={group.section}
          title={group.section}
          collapsible={group.collapsible}
        >
          <div className="grid md:grid-cols-2 gap-3">
            {group.fields.map((field) => (
              <label key={field.key} className="space-y-1">
                <span className="text-xs font-medium text-slate-500">{field.label}</span>

                {/* Provider default uses a dropdown */}
                {field.key === 'EVAL_PROVIDER_DEFAULT' ? (
                  <select
                    value={settings[field.key] ?? 'connect'}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0D2A66]"
                  >
                    {PROVIDER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={settings[field.key] ?? ''}
                    onChange={(e) => updateValue(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0D2A66]"
                  />
                )}
              </label>
            ))}
          </div>
        </CollapsibleSection>
      ))}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => { void save(); }}
          disabled={saving}
          className="btn-primary disabled:opacity-50"
        >
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
        {message && <span className="text-sm text-green-700">{message}</span>}
        {error && <span className="text-sm text-red-600">⚠ {error}</span>}
      </div>
    </div>
  );
}
