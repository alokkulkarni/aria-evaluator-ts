import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../lib/api.js';
import {
  DEFAULT_JUDGE_MAX_TOKENS,
  DEFAULT_JUDGE_MODEL_ID,
  DEFAULT_JUDGE_SYSTEM_PROMPT,
  DEFAULT_JUDGE_TEMPERATURE,
  JUDGE_GUARDRAILS,
  JUDGE_MODEL_GROUPS,
  LEGACY_JUDGE_SYSTEM_PROMPTS,
  isKnownJudgeModel,
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

interface ProviderSectionDef {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  fields: FieldDef[];
}

const JUDGE_MODEL_FIELD_KEY = 'JUDGE_MODEL_ID';
const JUDGE_CUSTOM_MODEL_FIELD_KEY = 'JUDGE_CUSTOM_MODEL_ID';
const JUDGE_USE_CUSTOM_MODEL_FIELD_KEY = 'JUDGE_USE_CUSTOM_MODEL_ID';
const JUDGE_TEMPERATURE_FIELD_KEY = 'JUDGE_TEMPERATURE';
const JUDGE_MAX_TOKENS_FIELD_KEY = 'JUDGE_MAX_TOKENS';
const JUDGE_SYSTEM_PROMPT_FIELD_KEY = 'JUDGE_SYSTEM_PROMPT';
const JUDGE_SETTING_KEYS = [
  JUDGE_MODEL_FIELD_KEY,
  JUDGE_CUSTOM_MODEL_FIELD_KEY,
  JUDGE_USE_CUSTOM_MODEL_FIELD_KEY,
  JUDGE_TEMPERATURE_FIELD_KEY,
  JUDGE_MAX_TOKENS_FIELD_KEY,
  JUDGE_SYSTEM_PROMPT_FIELD_KEY,
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

// ── Provider sections ─────────────────────────────────────────────────────────

const PROVIDER_SECTIONS: ProviderSectionDef[] = [
  {
    id: 'connect',
    title: 'Amazon Connect',
    icon: ProviderAwsIcon,
    description: 'Connect your Amazon Connect instance for chat and voice evaluation. Requires an IAM user or role with connect:StartChatContact / connect:StartContactStreaming permissions.',
    fields: [
      {
        key: 'CONNECT_INSTANCE_ID',
        label: 'Instance ID',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        hint: 'The Amazon Connect instance ID. Find it in the Connect console under Instance settings → Instance ARN (last segment).',
        required: true,
      },
      {
        key: 'CONNECT_REGION',
        label: 'Connect Region',
        placeholder: 'eu-west-2',
        hint: 'AWS region where your Connect instance is deployed, e.g. eu-west-2 or us-east-1. Used for all Connect API calls.',
      },
      {
        key: 'AWS_REGION',
        label: 'AWS Region Override',
        placeholder: 'eu-west-2',
        hint: 'Override the global AWS SDK region for all service calls. Set this if CONNECT_REGION alone is not picked up.',
      },
      {
        key: 'CONNECT_CONTACT_FLOW',
        label: 'Contact Flow ID / ARN (chat)',
        placeholder: 'arn:aws:connect:eu-west-2:123456789012:instance/.../contact-flow/...',
        hint: 'The Contact Flow ID or full ARN to start chat sessions against. Required for chat evaluation.',
        required: true,
      },
      {
        key: 'CONNECT_CONTACT_FLOW_NAME',
        label: 'Contact Flow Name (fallback)',
        placeholder: 'BasicChatFlow',
        hint: 'Fallback: provide the flow name to auto-resolve its ID. Used if Contact Flow ID/ARN is not set.',
      },
      {
        key: 'CONNECT_WEBRTC_FLOW_ID',
        label: 'WebRTC Flow ID (voice)',
        placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        hint: 'Contact Flow ID for WebRTC voice sessions. Only required when running voice evaluations.',
      },
      {
        key: 'CONNECT_WEBRTC_CONNECT_ATTEMPTS',
        label: 'WebRTC Connect Attempts',
        placeholder: '2',
        hint: 'How many times to retry a failed WebRTC connection before aborting. Defaults to 2.',
      },
      {
        key: 'CONNECT_PHONE_NUMBER',
        label: 'Phone Number',
        placeholder: '+441234567890',
        hint: 'E.164-format phone number associated with your Connect instance. Optional for most flows.',
      },
    ],
  },
  {
    id: 'lex',
    title: 'Amazon Lex',
    icon: ProviderAwsIcon,
    description: 'Evaluate a Lex V2 bot directly via the AWS SDK. Requires IAM credentials with lex:RecognizeText permission.',
    fields: [
      {
        key: 'LEX_BOT_ID',
        label: 'Bot ID',
        placeholder: 'ABCDEFGHIJ',
        hint: 'The Lex V2 Bot ID shown in the AWS console → Amazon Lex → Bots.',
        required: true,
      },
      {
        key: 'LEX_BOT_ALIAS_ID',
        label: 'Bot Alias ID',
        placeholder: 'TSTALIASID',
        hint: 'The alias ID for your deployed Lex bot. Use TSTALIASID for the TestBotAlias, or create a named alias for production.',
        required: true,
      },
      {
        key: 'LEX_BOT_LOCALE_ID',
        label: 'Bot Locale ID',
        placeholder: 'en_GB',
        hint: 'Locale of the Lex bot, e.g. en_GB, en_US, fr_FR. Must match a locale configured in the bot.',
        required: true,
      },
      {
        key: 'LEX_REGION',
        label: 'Lex Region',
        placeholder: 'eu-west-2',
        hint: 'AWS region where the Lex bot is deployed. Defaults to eu-west-2 if not set.',
      },
    ],
  },
  {
    id: 'azure',
    title: 'Azure Bot (Direct Line)',
    icon: ProviderMicrosoftIcon,
    description: 'Connect to an Azure Bot Service via the Direct Line API. Supports any Azure-hosted bot including Power Virtual Agents.',
    fields: [
      {
        key: 'AZURE_DIRECT_LINE_SECRET',
        label: 'Direct Line Secret',
        placeholder: 'xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxx',
        hint: 'Secret key from Azure Bot Service → Channels → Direct Line. Used to authenticate each conversation.',
        required: true,
        sensitive: true,
      },
      {
        key: 'AZURE_DIRECT_LINE_ENDPOINT',
        label: 'Direct Line Endpoint',
        placeholder: 'https://directline.botframework.com/v3/directline',
        hint: 'Direct Line API endpoint URL. Leave blank to use the default Microsoft global endpoint.',
      },
      {
        key: 'AZURE_DIRECT_LINE_USER_ID',
        label: 'User ID',
        placeholder: 'aria-evaluator-user',
        hint: 'User ID sent with each message for conversation tracking in bot analytics. Defaults to aria-evaluator-user.',
      },
    ],
  },
  {
    id: 'strands',
    title: 'Strands / AgentCore',
    icon: ProviderAwsIcon,
    description: 'Evaluate an AWS Strands agent or Bedrock AgentCore endpoint over HTTP. Supports no-auth, Bearer token, and AWS SigV4 signing.',
    fields: [
      {
        key: 'STRANDS_ENDPOINT',
        label: 'Endpoint URL',
        placeholder: 'https://runtime.agentcore.us-east-1.amazonaws.com/runtimes/.../invoke',
        hint: 'HTTP(S) URL of your Strands or AgentCore endpoint. Receives POST requests with conversation payload.',
        required: true,
      },
      {
        key: 'STRANDS_METHOD',
        label: 'HTTP Method',
        placeholder: 'POST',
        hint: 'HTTP verb to use when calling the endpoint. POST or PUT. Defaults to POST.',
      },
      {
        key: 'STRANDS_AUTH_TYPE',
        label: 'Auth Type',
        placeholder: 'none',
        hint: 'Authentication method: none (no auth), bearer (Authorization: Bearer <token>), or sigv4 (AWS Signature V4).',
      },
      {
        key: 'STRANDS_AUTH_BEARER',
        label: 'Bearer Token',
        placeholder: 'eyJhbGciOiJSUzI1NiJ9...',
        hint: 'Bearer token used when Auth Type is set to "bearer". Sent in the Authorization header.',
        sensitive: true,
      },
      {
        key: 'STRANDS_SIGV4_REGION',
        label: 'SigV4 Region',
        placeholder: 'eu-west-2',
        hint: 'AWS region used for SigV4 request signing. Required when Auth Type is "sigv4".',
      },
      {
        key: 'STRANDS_SIGV4_SERVICE',
        label: 'SigV4 Service',
        placeholder: 'bedrock-agentcore',
        hint: 'AWS service name used for SigV4 signing, e.g. bedrock-agentcore or execute-api. Required when Auth Type is "sigv4".',
      },
      {
        key: 'STRANDS_MESSAGE_FIELD',
        label: 'Message Field',
        placeholder: 'prompt',
        hint: 'JSON request body field name for the user\'s message. Defaults to "prompt".',
      },
      {
        key: 'STRANDS_RESPONSE_FIELD',
        label: 'Response Field Path',
        placeholder: 'result',
        hint: 'Dot-path to extract the agent reply from the JSON response, e.g. "result" or "output.content[0].text".',
      },
      {
        key: 'STRANDS_HISTORY_FIELD',
        label: 'History Field',
        placeholder: 'history',
        hint: 'Request body field name for conversation history (turn array). Defaults to "history".',
      },
      {
        key: 'STRANDS_SESSION_ID_FIELD',
        label: 'Session ID Field',
        placeholder: 'sessionId',
        hint: 'Request body field name for the session identifier. Defaults to "sessionId".',
      },
      {
        key: 'STRANDS_HEADERS_JSON',
        label: 'Extra Headers JSON',
        placeholder: '{"X-Api-Key":"abc123"}',
        hint: 'Additional HTTP headers as a JSON object. These are merged with auth headers on every request.',
      },
    ],
  },
  {
    id: 'copilot',
    title: 'Microsoft Copilot',
    icon: ProviderMicrosoftIcon,
    description: 'Evaluate a Microsoft Copilot Studio agent via the Direct Line API.',
    fields: [
      {
        key: 'COPILOT_DIRECT_LINE_SECRET',
        label: 'Direct Line Secret',
        placeholder: 'xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxx',
        hint: 'Direct Line secret from Microsoft Copilot Studio → Channels → Direct Line, or from Azure Bot Service.',
        required: true,
        sensitive: true,
      },
      {
        key: 'COPILOT_DIRECT_LINE_ENDPOINT',
        label: 'Direct Line Endpoint',
        placeholder: 'https://directline.botframework.com/v3/directline',
        hint: 'Direct Line endpoint URL. Leave blank for the default Microsoft endpoint. Power Platform bots may use a regional URL.',
      },
      {
        key: 'COPILOT_DIRECT_LINE_USER_ID',
        label: 'User ID',
        placeholder: 'aria-evaluator-user',
        hint: 'User ID sent with each message, shown in Copilot analytics and conversation logs.',
      },
    ],
  },
  {
    id: 'custom-chat',
    title: 'Custom Chat Provider',
    icon: ProviderChatIcon,
    description: 'Evaluate any HTTP-based chat endpoint. Each turn sends a POST/PUT with the message and conversation history.',
    fields: [
      {
        key: 'CUSTOM_CHAT_ENDPOINT',
        label: 'Chat Endpoint URL',
        placeholder: 'https://api.example.com/chat',
        hint: 'Full HTTP(S) URL of your chat endpoint. Must accept POST (or PUT) with a JSON body and return JSON.',
        required: true,
      },
      {
        key: 'CUSTOM_CHAT_METHOD',
        label: 'HTTP Method',
        placeholder: 'POST',
        hint: 'HTTP verb: POST or PUT. Defaults to POST.',
      },
      {
        key: 'CUSTOM_CHAT_AUTH_BEARER',
        label: 'Bearer Token',
        placeholder: 'sk-...',
        hint: 'Bearer token sent in the Authorization header. Leave blank for unauthenticated endpoints.',
        sensitive: true,
      },
      {
        key: 'CUSTOM_CHAT_MESSAGE_FIELD',
        label: 'Message Field',
        placeholder: 'message',
        hint: 'JSON body field name for the outgoing user message. Defaults to "message".',
      },
      {
        key: 'CUSTOM_CHAT_RESPONSE_FIELD',
        label: 'Response Field',
        placeholder: 'reply',
        hint: 'JSON response field path for the agent reply. Supports dot-notation, e.g. "data.reply". Defaults to "reply".',
      },
      {
        key: 'CUSTOM_CHAT_HEADERS_JSON',
        label: 'Extra Headers JSON',
        placeholder: '{"X-Api-Key":"abc123"}',
        hint: 'Additional HTTP headers sent on every request, as a JSON object.',
      },
    ],
  },
  {
    id: 'custom-voice',
    title: 'Custom Voice Provider',
    icon: ProviderVoiceIcon,
    description: 'Evaluate a voice agent over WebSocket. Supports Deepgram Voice Agent, AgentCore voice, or any generic JSON-over-WebSocket protocol.',
    fields: [
      {
        key: 'CUSTOM_VOICE_PROTOCOL',
        label: 'Voice Protocol',
        placeholder: 'deepgram',
        hint: 'Protocol to use: "deepgram" (Deepgram Voice Agent API), "agentcore" (AWS Bedrock AgentCore), or "generic-json" (custom JSON WebSocket).',
        required: true,
      },
      {
        key: 'DEEPGRAM_VOICE_WS_URL',
        label: 'Deepgram WS URL',
        placeholder: 'wss://agent.deepgram.com/agent',
        hint: 'Deepgram Voice Agent WebSocket URL. Required when protocol is "deepgram".',
      },
      {
        key: 'DEEPGRAM_API_KEY',
        label: 'Deepgram API Key',
        placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        hint: 'Your Deepgram API key used as the authentication token. Required when protocol is "deepgram".',
        sensitive: true,
      },
      {
        key: 'DEEPGRAM_VOICE_SETTINGS_JSON',
        label: 'Deepgram Settings JSON',
        placeholder: '{"type":"Settings","audio":{...},"agent":{...}}',
        hint: 'Override the default Deepgram Settings message sent after connection. Leave blank to use built-in defaults (nova-3 + gpt-4o-mini).',
      },
      {
        key: 'CUSTOM_VOICE_WS_URL',
        label: 'Generic Voice WS URL',
        placeholder: 'wss://api.example.com/voice',
        hint: 'WebSocket URL for generic-json or agentcore voice protocol. Required when protocol is not "deepgram".',
      },
      {
        key: 'CUSTOM_VOICE_WS_AUTH_HEADER_NAME',
        label: 'Generic WS Auth Header Name',
        placeholder: 'Authorization',
        hint: 'HTTP header name for WebSocket authentication, e.g. "Authorization" or "X-Api-Key".',
      },
      {
        key: 'CUSTOM_VOICE_WS_AUTH_HEADER_VALUE',
        label: 'Generic WS Auth Header Value',
        placeholder: 'Bearer eyJ...',
        hint: 'Value for the authentication header, e.g. "Bearer <token>" or your API key.',
        sensitive: true,
      },
      {
        key: 'CUSTOM_VOICE_WS_INIT_JSON',
        label: 'Generic WS Init JSON',
        placeholder: '{"type":"init","version":"1"}',
        hint: 'JSON message sent immediately after the WebSocket connection opens (handshake/init). Leave blank if not required.',
      },
      {
        key: 'CUSTOM_VOICE_WS_SEND_TEMPLATE',
        label: 'Generic WS Send Template',
        placeholder: '{"type":"message","content":"{{message}}"}',
        hint: 'JSON template for outgoing messages. Use {{message}} as the placeholder; it will be JSON-string-escaped before insertion.',
      },
      {
        key: 'CUSTOM_VOICE_WS_AGENT_EVENT_TYPES',
        label: 'Agent Event Types',
        placeholder: 'agent,assistant,message,ConversationText',
        hint: 'Comma-separated list of event "type" values to treat as agent speech. Frames with other types are ignored.',
      },
      {
        key: 'CUSTOM_VOICE_WS_MESSAGE_PATH',
        label: 'Agent Message Path',
        placeholder: 'content',
        hint: 'Dot-notation path to extract the spoken text from the JSON event, e.g. "content" or "data.transcript".',
      },
    ],
  },
  {
    id: 'openapi',
    title: 'OpenAPI Chat Provider',
    icon: ProviderOpenApiIcon,
    description: 'Evaluate any chat endpoint described by an OpenAPI spec. Supports HTTP with bearer, API key, or basic authentication.',
    fields: [
      {
        key: 'OPENAPI_SPEC_URL',
        label: 'OpenAPI Spec URL',
        placeholder: 'https://api.example.com/openapi.yaml',
        hint: 'URL to fetch the OpenAPI 3.x spec. Used for documentation and field-name discovery only — not required at evaluation runtime.',
      },
      {
        key: 'OPENAPI_ENDPOINT_URL',
        label: 'Chat Endpoint URL',
        placeholder: 'http://host.docker.internal:8765/chat',
        hint: 'Full URL of the chat endpoint from the spec. This is the URL that receives each evaluation turn.',
        required: true,
      },
      {
        key: 'OPENAPI_METHOD',
        label: 'HTTP Method',
        placeholder: 'POST',
        hint: 'HTTP verb to use: POST or PUT. Defaults to POST.',
      },
      {
        key: 'OPENAPI_AUTH_TYPE',
        label: 'Auth Type',
        placeholder: 'none',
        hint: 'Authentication mode: "none" (no auth), "bearer" (Authorization: Bearer), "apikey" (custom header), or "basic" (Base64 user:password).',
      },
      {
        key: 'OPENAPI_AUTH_VALUE',
        label: 'Auth Value',
        placeholder: 'eyJhbGciOiJSUzI1NiJ9...',
        hint: 'Credential for the selected auth type — token (bearer), API key value (apikey), or user:password string (basic).',
        sensitive: true,
      },
      {
        key: 'OPENAPI_AUTH_HEADER_NAME',
        label: 'API Key Header Name',
        placeholder: 'X-Api-Key',
        hint: 'Header name for API key authentication, e.g. "X-Api-Key" or "X-Token". Used only when Auth Type is "apikey".',
      },
      {
        key: 'OPENAPI_HEADERS_JSON',
        label: 'Extra Headers JSON',
        placeholder: '{"X-Custom":"value"}',
        hint: 'Additional HTTP headers to include on every request, as a JSON object.',
      },
      {
        key: 'OPENAPI_MESSAGE_FIELD',
        label: 'Message Field',
        placeholder: 'message',
        hint: 'JSON body field name for the outgoing user message. Defaults to "message".',
      },
      {
        key: 'OPENAPI_RESPONSE_FIELD',
        label: 'Response Field Path',
        placeholder: 'reply',
        hint: 'Dot-notation path to extract the agent reply from the JSON response. Defaults to "reply".',
      },
    ],
  },
  {
    id: 'websocket',
    title: 'WebSocket Chat Provider (ws / wss)',
    icon: ProviderWebSocketIcon,
    description: 'Evaluate a chat agent over a persistent WebSocket connection. Supports plain ws:// and secure wss:// with optional authentication headers and custom JSON frame formats.',
    fields: [
      {
        key: 'WS_CHAT_URL',
        label: 'WebSocket URL',
        placeholder: 'wss://api.example.com/chat',
        hint: 'Full WebSocket endpoint URL using ws:// (plain) or wss:// (TLS) scheme.',
        required: true,
      },
      {
        key: 'WS_CHAT_AUTH_HEADER_NAME',
        label: 'Auth Header Name',
        placeholder: 'Authorization',
        hint: 'HTTP header name sent during the WebSocket upgrade handshake for authentication, e.g. "Authorization" or "X-Api-Key".',
      },
      {
        key: 'WS_CHAT_AUTH_HEADER_VALUE',
        label: 'Auth Header Value',
        placeholder: 'Bearer eyJ...',
        hint: 'Value for the authentication header, e.g. "Bearer <token>" or your API key string.',
        sensitive: true,
      },
      {
        key: 'WS_CHAT_SUBPROTOCOL',
        label: 'Sub-Protocol',
        placeholder: 'chat',
        hint: 'WebSocket Sec-WebSocket-Protocol header value, e.g. "chat" or "json". Only set if your server requires it.',
      },
      {
        key: 'WS_CHAT_INIT_JSON',
        label: 'Init JSON',
        placeholder: '{"type":"init","version":"1"}',
        hint: 'JSON payload sent immediately after the socket opens (handshake/session init). Leave blank if no init frame is needed.',
      },
      {
        key: 'WS_CHAT_SEND_TEMPLATE',
        label: 'Send Template',
        placeholder: '{"type":"message","text":"{{message}}"}',
        hint: 'JSON template for outgoing messages. Use {{message}} as the placeholder — the text is JSON-escaped before insertion. Leave blank to send raw text frames.',
      },
      {
        key: 'WS_CHAT_AGENT_EVENT_TYPES',
        label: 'Agent Event Types',
        placeholder: 'agent,assistant,message',
        hint: 'Comma-separated list of JSON "type" field values to accept as agent replies. Leave blank to accept all incoming frames.',
      },
      {
        key: 'WS_CHAT_MESSAGE_PATH',
        label: 'Response Message Path',
        placeholder: 'body.text',
        hint: 'Dot-notation path to extract reply text from JSON frames, e.g. "body.text" or "data.content". Leave blank to treat the entire frame as raw text.',
      },
    ],
  },
];

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

// ── Provider sub-section ──────────────────────────────────────────────────────

function ProviderSubSection({
  section,
  settings,
  onUpdate,
}: {
  section: ProviderSectionDef;
  settings: SettingsMap;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const filledRequired = section.fields.filter((f) => f.required && settings[f.key]?.trim()).length;
  const totalRequired = section.fields.filter((f) => f.required).length;
  const isConfigured = totalRequired === 0 || filledRequired === totalRequired;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <section.icon className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
          <span className="text-sm font-semibold text-slate-800">{section.title}</span>
          {isConfigured && totalRequired > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
              <RunPassIcon className="h-3 w-3" aria-hidden="true" />
              configured
            </span>
          )}
          {!isConfigured && (
            <span className="text-[10px] bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 font-medium">
              {filledRequired}/{totalRequired} required
            </span>
          )}
        </div>
        <span
          className="text-slate-400 transition-transform duration-200"
          style={{ display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 bg-slate-50/50 border-t border-slate-100">
          <p className="text-xs text-slate-500 mt-2 mb-4 leading-relaxed">{section.description}</p>
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

function JudgeLlmSection({
  settings,
  onUpdate,
}: {
  settings: SettingsMap;
  onUpdate: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const modelId = settings[JUDGE_MODEL_FIELD_KEY] ?? DEFAULT_JUDGE_MODEL_ID;
  const useCustomModel = (settings[JUDGE_USE_CUSTOM_MODEL_FIELD_KEY] ?? 'false') === 'true';
  const customModelId = settings[JUDGE_CUSTOM_MODEL_FIELD_KEY] ?? '';
  const temperature = settings[JUDGE_TEMPERATURE_FIELD_KEY] ?? DEFAULT_JUDGE_TEMPERATURE;
  const maxTokens = settings[JUDGE_MAX_TOKENS_FIELD_KEY] ?? DEFAULT_JUDGE_MAX_TOKENS;
  const systemPrompt = settings[JUDGE_SYSTEM_PROMPT_FIELD_KEY] ?? DEFAULT_JUDGE_SYSTEM_PROMPT;
  const activeModel = useCustomModel && customModelId ? customModelId : modelId;

  return (
    <section className="card space-y-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Judge LLM</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Model, temperature, and prompt</h3>
          <p className="mt-1 text-sm text-slate-500">
            Changes apply to the next run immediately. A custom model ID overrides the preset when filled.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
            Bedrock
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {open ? 'Collapse' : 'Expand'}
          </span>
        </div>
      </button>

      {open ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                Preset model
                <HintTooltip hint="Choose a common Amazon Bedrock text model. You can override it with a custom model ID below." />
              </span>
              <select
                value={isKnownJudgeModel(modelId) ? modelId : DEFAULT_JUDGE_MODEL_ID}
                onChange={(e) => {
                  onUpdate(JUDGE_MODEL_FIELD_KEY, e.target.value);
                  onUpdate(JUDGE_CUSTOM_MODEL_FIELD_KEY, '');
                }}
              >
                {judgeModelGroups.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                Custom model ID
                <HintTooltip hint="Optional. Enable the checkbox to use an imported or custom Bedrock model ID instead of the preset." />
              </span>
              <label className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <input
                  type="checkbox"
                  checked={useCustomModel}
                  onChange={(e) => onUpdate(JUDGE_USE_CUSTOM_MODEL_FIELD_KEY, e.target.checked ? 'true' : 'false')}
                />
                Use custom model ID
              </label>
              <input
                type="text"
                value={customModelId}
                onChange={(e) => onUpdate(JUDGE_CUSTOM_MODEL_FIELD_KEY, e.target.value)}
                placeholder="Enter a Bedrock model ID"
                readOnly={!useCustomModel}
                title={useCustomModel ? 'Custom model ID' : 'Enable the checkbox to edit'}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                Temperature
                <HintTooltip hint="Lower values make the judge stricter and more deterministic. Defaults to 0." />
              </span>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => onUpdate(JUDGE_TEMPERATURE_FIELD_KEY, e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
                Max tokens
                <HintTooltip hint="Maximum output tokens for each judge call. Defaults to 2000." />
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={maxTokens}
                onChange={(e) => onUpdate(JUDGE_MAX_TOKENS_FIELD_KEY, e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Configured guardrails</p>
              <p className="mt-1 text-xs text-slate-500">
                These are part of the default system prompt and are sent to Bedrock on every judge call.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                The app also adds run-specific dimension instructions for each evaluation.
              </p>
            </div>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {JUDGE_GUARDRAILS.map((rule) => (
                <li key={rule} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-cyan-500" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
              System prompt
              <HintTooltip hint="This exact text is sent as the judge system prompt. It is editable and takes effect on the next run." />
            </span>
            <textarea
              rows={14}
              value={systemPrompt}
              onChange={(e) => onUpdate(JUDGE_SYSTEM_PROMPT_FIELD_KEY, e.target.value)}
              className="min-h-[280px] font-mono text-xs leading-6"
            />
          </label>
        </>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Model</p>
            <p className="mt-1 text-sm font-medium text-slate-900 truncate">{activeModel}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Temperature</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{temperature}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Max tokens</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{maxTokens}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Prompt</p>
            <p className="mt-1 text-sm font-medium text-slate-900">Configured</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {useCustomModel ? 'Custom override enabled' : 'Preset model in use'}
            </p>
          </div>
        </div>
      )}
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
  const [judgeModelGroups, setJudgeModelGroups] = useState(JUDGE_MODEL_GROUPS);
  const savedJudgeSettingsSignatureRef = useRef<string>('');
  const loadedJudgeSettingsSignatureRef = useRef<string>('');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/settings'),
      apiFetch('/api/settings/judge-models'),
    ])
      .then(([settingsData, modelsData]: [{ settings: SettingsMap }, { region: string; models: any[] }]) => {
        setSettings(normalizeJudgeSettings(settingsData.settings ?? {}));
        setJudgeModelGroups(modelsData.models ?? JUDGE_MODEL_GROUPS);
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

      <JudgeLlmSection settings={settings} onUpdate={updateValue} />

      {/* Providers group */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200/80 bg-white">
          <div className="flex items-center gap-2">
            <ProviderDefaultsIcon className="h-5 w-5 text-slate-500" aria-hidden="true" />
            <div>
              <h3 className="font-semibold text-base text-slate-900">Providers</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure connection settings for each evaluation provider. Expand a provider to view and edit its fields.</p>
            </div>
          </div>
        </div>
        <div className="border-b border-slate-100 bg-slate-50/50 px-5 py-4">
          <label className="flex flex-col gap-1 max-w-xs">
            <span className="flex items-center gap-1 text-xs font-medium text-slate-600">
              Default Provider
              <HintTooltip hint="The provider pre-selected when starting a new run. Can be overridden per-run in the New Run modal." />
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
          <p className="mt-3 text-xs text-slate-500">Sets the pre-selected provider in the New Run modal and Scenarios page.</p>
        </div>
        <div className="divide-y divide-slate-100">
          {PROVIDER_SECTIONS.map((section) => (
            <ProviderSubSection
              key={section.id}
              section={section}
              settings={settings}
              onUpdate={updateValue}
            />
          ))}
        </div>
      </div>

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
