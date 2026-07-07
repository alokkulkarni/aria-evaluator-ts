// src/shared/provider-fields.ts
// Single source of truth for the provider taxonomy and each provider type's
// configuration fields. Pure, browser-safe module (no SDK / node imports) so it
// can be consumed by the server (validation + env overlay), the API
// (redaction), and the React UI (rendering instance editors + selectors).
//
// Each provider instance stores its config under the SAME env-var key names the
// adapters already read from process.env, so "selecting an instance" is just an
// env overlay at the run-executor seam — no adapter or CLI changes required.

export const RUN_PROVIDERS = [
  'connect',
  'lex',
  'azure',
  'azure-openai',
  'strands',
  'copilot',
  'custom',
  'openapi',
  'websocket',
] as const;

export type RunProvider = (typeof RUN_PROVIDERS)[number];

export const MAX_INSTANCES_PER_PROVIDER = 5;

export interface ProviderFieldDef {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  sensitive?: boolean;
  /** For multi-channel providers (custom), which channel the field belongs to. */
  channel?: 'chat' | 'voice';
}

export interface ProviderTypeDef {
  type: RunProvider;
  /** Human label for dropdowns / section headers. */
  label: string;
  description: string;
  fields: ProviderFieldDef[];
}

/**
 * Voice (bidirectional-audio WebSocket) fields, shared by every provider that can
 * run voice through the generic voice adapter (custom, strands, openapi,
 * websocket). Keyed by the same env-var names the voice adapter reads from
 * process.env, so voice is a single, provider-agnostic mechanism: pick a protocol
 * and point it at a voice WebSocket endpoint.
 */
export const VOICE_WS_FIELDS: ProviderFieldDef[] = [
  { key: 'CUSTOM_VOICE_PROTOCOL', label: 'Voice Protocol', placeholder: 'deepgram', hint: 'Protocol to use: "deepgram" (Deepgram Voice Agent API), "agentcore" (AWS Bedrock AgentCore), or "generic-json" (custom JSON WebSocket).', channel: 'voice' },
  { key: 'DEEPGRAM_VOICE_WS_URL', label: 'Deepgram WS URL', placeholder: 'wss://agent.deepgram.com/agent', hint: 'Deepgram Voice Agent WebSocket URL. Required when protocol is "deepgram".', channel: 'voice' },
  { key: 'DEEPGRAM_API_KEY', label: 'Deepgram API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Your Deepgram API key used as the authentication token. Required when protocol is "deepgram".', sensitive: true, channel: 'voice' },
  { key: 'DEEPGRAM_VOICE_SETTINGS_JSON', label: 'Deepgram Settings JSON', placeholder: '{"type":"Settings","audio":{...},"agent":{...}}', hint: 'Override the default Deepgram Settings message sent after connection. Leave blank to use built-in defaults (nova-3 + gpt-4o-mini).', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_URL', label: 'Generic Voice WS URL', placeholder: 'wss://api.example.com/voice', hint: 'WebSocket URL for generic-json or agentcore voice protocol. Required when protocol is not "deepgram".', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_AUTH_HEADER_NAME', label: 'Generic WS Auth Header Name', placeholder: 'Authorization', hint: 'HTTP header name for WebSocket authentication, e.g. "Authorization" or "X-Api-Key".', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_AUTH_HEADER_VALUE', label: 'Generic WS Auth Header Value', placeholder: 'Bearer eyJ...', hint: 'Value for the authentication header, e.g. "Bearer <token>" or your API key.', sensitive: true, channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_INIT_JSON', label: 'Generic WS Init JSON', placeholder: '{"type":"init","version":"1"}', hint: 'JSON message sent immediately after the WebSocket connection opens (handshake/init). Leave blank if not required.', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_SEND_TEMPLATE', label: 'Generic WS Send Template', placeholder: '{"type":"message","content":"{{message}}"}', hint: 'JSON template for outgoing messages. Use {{message}} as the placeholder; it will be JSON-string-escaped before insertion.', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_AGENT_EVENT_TYPES', label: 'Agent Event Types', placeholder: 'agent,assistant,message,ConversationText', hint: 'Comma-separated list of event "type" values to treat as agent speech. Frames with other types are ignored.', channel: 'voice' },
  { key: 'CUSTOM_VOICE_WS_MESSAGE_PATH', label: 'Agent Message Path', placeholder: 'content', hint: 'Dot-notation path to extract the spoken text from the JSON event, e.g. "content" or "data.transcript".', channel: 'voice' },
];

export const PROVIDER_DEFS: Record<RunProvider, ProviderTypeDef> = {
  connect: {
    type: 'connect',
    label: 'Amazon Connect',
    description:
      'Connect your Amazon Connect instance for chat and voice evaluation. Requires an IAM user or role with connect:StartChatContact / connect:StartContactStreaming permissions.',
    fields: [
      { key: 'CONNECT_INSTANCE_ID', label: 'Instance ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'The Amazon Connect instance ID. Find it in the Connect console under Instance settings → Instance ARN (last segment).', required: true },
      { key: 'CONNECT_REGION', label: 'Connect Region', placeholder: 'eu-west-2', hint: 'AWS region where your Connect instance is deployed, e.g. eu-west-2 or us-east-1. NOTE: a globally-set AWS_REGION env var takes precedence over this per-instance value — to run Connect instances in different regions, leave the global AWS Region Override unset.' },
      { key: 'CONNECT_CONTACT_FLOW', label: 'Contact Flow ID / ARN (chat)', placeholder: 'arn:aws:connect:eu-west-2:123456789012:instance/.../contact-flow/...', hint: 'The Contact Flow ID or full ARN to start chat sessions against. Required for chat evaluation.', required: true, channel: 'chat' },
      { key: 'CONNECT_CONTACT_FLOW_NAME', label: 'Contact Flow Name (fallback)', placeholder: 'BasicChatFlow', hint: 'Fallback: provide the flow name to auto-resolve its ID. Used if Contact Flow ID/ARN is not set.', channel: 'chat' },
      { key: 'CONNECT_WEBRTC_FLOW_ID', label: 'WebRTC Flow ID (voice)', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', hint: 'Contact Flow ID for WebRTC voice sessions. Only required when running voice evaluations.', channel: 'voice' },
      { key: 'CONNECT_WEBRTC_CONNECT_ATTEMPTS', label: 'WebRTC Connect Attempts', placeholder: '2', hint: 'How many times to retry a failed WebRTC connection before aborting. Defaults to 2.', channel: 'voice' },
      { key: 'CONNECT_PHONE_NUMBER', label: 'Phone Number', placeholder: '+441234567890', hint: 'E.164-format phone number associated with your Connect instance. Optional for most flows.' },
    ],
  },
  lex: {
    type: 'lex',
    label: 'Amazon Lex',
    description: 'Evaluate a Lex V2 bot directly via the AWS SDK. Requires IAM credentials with lex:RecognizeText permission.',
    fields: [
      { key: 'LEX_BOT_ID', label: 'Bot ID', placeholder: 'ABCDEFGHIJ', hint: 'The Lex V2 Bot ID shown in the AWS console → Amazon Lex → Bots.', required: true },
      { key: 'LEX_BOT_ALIAS_ID', label: 'Bot Alias ID', placeholder: 'TSTALIASID', hint: 'The alias ID for your deployed Lex bot. Use TSTALIASID for the TestBotAlias, or create a named alias for production.', required: true },
      { key: 'LEX_BOT_LOCALE_ID', label: 'Bot Locale ID', placeholder: 'en_GB', hint: 'Locale of the Lex bot, e.g. en_GB, en_US, fr_FR. Must match a locale configured in the bot.', required: true },
      { key: 'LEX_REGION', label: 'Lex Region', placeholder: 'eu-west-2', hint: 'AWS region where the Lex bot is deployed. Defaults to eu-west-2 if not set.' },
    ],
  },
  azure: {
    type: 'azure',
    label: 'Azure Bot (Direct Line)',
    description: 'Connect to an Azure Bot Service via the Direct Line API. Supports any Azure-hosted bot including Power Virtual Agents.',
    fields: [
      { key: 'AZURE_DIRECT_LINE_SECRET', label: 'Direct Line Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Secret key from Azure Bot Service → Channels → Direct Line. Used to authenticate each conversation.', required: true, sensitive: true },
      { key: 'AZURE_DIRECT_LINE_ENDPOINT', label: 'Direct Line Endpoint', placeholder: 'https://directline.botframework.com/v3/directline', hint: 'Direct Line API endpoint URL. Leave blank to use the default Microsoft global endpoint.' },
      { key: 'AZURE_DIRECT_LINE_USER_ID', label: 'User ID', placeholder: 'aria-evaluator-user', hint: 'User ID sent with each message for conversation tracking in bot analytics. Defaults to aria-evaluator-user.' },
    ],
  },
  'azure-openai': {
    type: 'azure-openai',
    label: 'Azure OpenAI',
    description: 'Test an agent built on an Azure OpenAI chat deployment. ARIA holds the conversation with your deployment, using the instructions you set below as the agent under test.',
    fields: [
      { key: 'AZURE_OPENAI_AGENT_ENDPOINT', label: 'Endpoint', placeholder: 'https://my-resource.openai.azure.com', hint: 'Your Azure OpenAI resource endpoint. Find it in the Azure portal under your resource → Keys and Endpoint.', required: true },
      { key: 'AZURE_OPENAI_AGENT_API_KEY', label: 'API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Key 1 or Key 2 from your Azure OpenAI resource → Keys and Endpoint.', required: true, sensitive: true },
      { key: 'AZURE_OPENAI_AGENT_DEPLOYMENT', label: 'Deployment Name', placeholder: 'gpt-4o', hint: 'The name of your model deployment (Azure OpenAI Studio → Deployments) — this is the deployment name, not the base model name.', required: true },
      { key: 'AZURE_OPENAI_AGENT_API_VERSION', label: 'API Version', placeholder: '2024-10-21', hint: 'Azure OpenAI REST API version. Leave blank to use the default (2024-10-21).' },
      { key: 'AZURE_OPENAI_AGENT_SYSTEM_PROMPT', label: 'Agent Instructions', placeholder: 'You are a helpful customer support agent for Acme Bank...', hint: 'The system prompt that defines how your agent should behave. This is the agent under test that ARIA evaluates.' },
    ],
  },
  strands: {
    type: 'strands',
    label: 'Strands / AgentCore',
    description: 'Evaluate an AWS Strands agent or Bedrock AgentCore endpoint over HTTP (chat), or over a bidirectional-audio WebSocket (voice — e.g. Nova Sonic / AgentCore audio). Supports no-auth, Bearer token, and AWS SigV4 signing for chat.',
    fields: [
      { key: 'STRANDS_ENDPOINT', label: 'Endpoint URL', placeholder: 'https://runtime.agentcore.us-east-1.amazonaws.com/runtimes/.../invoke', hint: 'HTTP(S) URL of your Strands or AgentCore endpoint. Receives POST requests with conversation payload.', required: true },
      { key: 'STRANDS_METHOD', label: 'HTTP Method', placeholder: 'POST', hint: 'HTTP verb to use when calling the endpoint. POST or PUT. Defaults to POST.' },
      { key: 'STRANDS_AUTH_TYPE', label: 'Auth Type', placeholder: 'none', hint: 'Authentication method: none (no auth), bearer (Authorization: Bearer <token>), or sigv4 (AWS Signature V4).' },
      { key: 'STRANDS_AUTH_BEARER', label: 'Bearer Token', placeholder: 'eyJhbGciOiJSUzI1NiJ9...', hint: 'Bearer token used when Auth Type is set to "bearer". Sent in the Authorization header.', sensitive: true },
      { key: 'STRANDS_SIGV4_REGION', label: 'SigV4 Region', placeholder: 'eu-west-2', hint: 'AWS region used for SigV4 request signing. Required when Auth Type is "sigv4".' },
      { key: 'STRANDS_SIGV4_SERVICE', label: 'SigV4 Service', placeholder: 'bedrock-agentcore', hint: 'AWS service name used for SigV4 signing, e.g. bedrock-agentcore or execute-api. Required when Auth Type is "sigv4".' },
      { key: 'STRANDS_MESSAGE_FIELD', label: 'Message Field', placeholder: 'prompt', hint: 'JSON request body field name for the user\'s message. Defaults to "prompt".' },
      { key: 'STRANDS_RESPONSE_FIELD', label: 'Response Field Path', placeholder: 'result', hint: 'Dot-path to extract the agent reply from the JSON response, e.g. "result" or "output.content[0].text".' },
      { key: 'STRANDS_HISTORY_FIELD', label: 'History Field', placeholder: 'history', hint: 'Request body field name for conversation history (turn array). Defaults to "history".' },
      { key: 'STRANDS_SESSION_ID_FIELD', label: 'Session ID Field', placeholder: 'sessionId', hint: 'Request body field name for the session identifier. Defaults to "sessionId".' },
      { key: 'STRANDS_HEADERS_JSON', label: 'Extra Headers JSON', placeholder: '{"X-Api-Key":"abc123"}', hint: 'Additional HTTP headers as a JSON object. These are merged with auth headers on every request.' },
      // Voice (WebSocket) — fill these to run this provider on the voice channel.
      ...VOICE_WS_FIELDS,
    ],
  },
  copilot: {
    type: 'copilot',
    label: 'Microsoft Copilot',
    description: 'Evaluate a Microsoft Copilot Studio agent via the Direct Line API.',
    fields: [
      { key: 'COPILOT_DIRECT_LINE_SECRET', label: 'Direct Line Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxx', hint: 'Direct Line secret from Microsoft Copilot Studio → Channels → Direct Line, or from Azure Bot Service.', required: true, sensitive: true },
      { key: 'COPILOT_DIRECT_LINE_ENDPOINT', label: 'Direct Line Endpoint', placeholder: 'https://directline.botframework.com/v3/directline', hint: 'Direct Line endpoint URL. Leave blank for the default Microsoft endpoint. Power Platform bots may use a regional URL.' },
      { key: 'COPILOT_DIRECT_LINE_USER_ID', label: 'User ID', placeholder: 'aria-evaluator-user', hint: 'User ID sent with each message, shown in Copilot analytics and conversation logs.' },
    ],
  },
  custom: {
    type: 'custom',
    label: 'Custom (HTTP chat / WebSocket voice)',
    description: 'Evaluate any HTTP chat endpoint or WebSocket voice agent. Fill the chat fields for chat runs, or the voice fields for voice runs.',
    fields: [
      // Chat (HTTP)
      { key: 'CUSTOM_CHAT_ENDPOINT', label: 'Chat Endpoint URL', placeholder: 'https://api.example.com/chat', hint: 'Full HTTP(S) URL of your chat endpoint. Must accept POST (or PUT) with a JSON body and return JSON.', required: true, channel: 'chat' },
      { key: 'CUSTOM_CHAT_METHOD', label: 'Chat HTTP Method', placeholder: 'POST', hint: 'HTTP verb: POST or PUT. Defaults to POST.', channel: 'chat' },
      { key: 'CUSTOM_CHAT_AUTH_BEARER', label: 'Chat Bearer Token', placeholder: 'sk-...', hint: 'Bearer token sent in the Authorization header. Leave blank for unauthenticated endpoints.', sensitive: true, channel: 'chat' },
      { key: 'CUSTOM_CHAT_MESSAGE_FIELD', label: 'Chat Message Field', placeholder: 'message', hint: 'JSON body field name for the outgoing user message. Defaults to "message".', channel: 'chat' },
      { key: 'CUSTOM_CHAT_RESPONSE_FIELD', label: 'Chat Response Field', placeholder: 'reply', hint: 'JSON response field path for the agent reply. Supports dot-notation, e.g. "data.reply". Defaults to "reply".', channel: 'chat' },
      { key: 'CUSTOM_CHAT_HEADERS_JSON', label: 'Chat Extra Headers JSON', placeholder: '{"X-Api-Key":"abc123"}', hint: 'Additional HTTP headers sent on every request, as a JSON object.', channel: 'chat' },
      // Voice (WebSocket) — shared voice-endpoint fields
      ...VOICE_WS_FIELDS,
    ],
  },
  openapi: {
    type: 'openapi',
    label: 'OpenAPI',
    description: 'Evaluate any chat endpoint described by an OpenAPI spec (HTTP with bearer, API key, or basic auth). For voice, point the voice fields at a bidirectional-audio WebSocket endpoint — plain HTTP cannot stream audio.',
    fields: [
      { key: 'OPENAPI_SPEC_URL', label: 'OpenAPI Spec URL', placeholder: 'https://api.example.com/openapi.yaml', hint: 'URL to fetch the OpenAPI 3.x spec. Used for documentation and field-name discovery only — not required at evaluation runtime.' },
      { key: 'OPENAPI_ENDPOINT_URL', label: 'Chat Endpoint URL', placeholder: 'http://host.docker.internal:8765/chat', hint: 'Full URL of the chat endpoint from the spec. This is the URL that receives each evaluation turn.', required: true },
      { key: 'OPENAPI_METHOD', label: 'HTTP Method', placeholder: 'POST', hint: 'HTTP verb to use: POST or PUT. Defaults to POST.' },
      { key: 'OPENAPI_AUTH_TYPE', label: 'Auth Type', placeholder: 'none', hint: 'Authentication mode: "none" (no auth), "bearer" (Authorization: Bearer), "apikey" (custom header), or "basic" (Base64 user:password).' },
      { key: 'OPENAPI_AUTH_VALUE', label: 'Auth Value', placeholder: 'eyJhbGciOiJSUzI1NiJ9...', hint: 'Credential for the selected auth type — token (bearer), API key value (apikey), or user:password string (basic).', sensitive: true },
      { key: 'OPENAPI_AUTH_HEADER_NAME', label: 'API Key Header Name', placeholder: 'X-Api-Key', hint: 'Header name for API key authentication, e.g. "X-Api-Key" or "X-Token". Used only when Auth Type is "apikey".' },
      { key: 'OPENAPI_HEADERS_JSON', label: 'Extra Headers JSON', placeholder: '{"X-Custom":"value"}', hint: 'Additional HTTP headers to include on every request, as a JSON object.' },
      { key: 'OPENAPI_MESSAGE_FIELD', label: 'Message Field', placeholder: 'message', hint: 'JSON body field name for the outgoing user message. Defaults to "message".' },
      { key: 'OPENAPI_RESPONSE_FIELD', label: 'Response Field Path', placeholder: 'reply', hint: 'Dot-notation path to extract the agent reply from the JSON response. Defaults to "reply".' },
      // Voice (WebSocket) — fill these to run this provider on the voice channel.
      ...VOICE_WS_FIELDS,
    ],
  },
  websocket: {
    type: 'websocket',
    label: 'WebSocket (chat / voice)',
    description: 'Evaluate an agent over a persistent WebSocket. Use the chat fields for text frames, or the voice fields for a bidirectional-audio WebSocket (deepgram / agentcore / generic-json).',
    fields: [
      { key: 'WS_CHAT_URL', label: 'WebSocket URL', placeholder: 'wss://api.example.com/chat', hint: 'Full WebSocket endpoint URL using ws:// (plain) or wss:// (TLS) scheme.', required: true },
      { key: 'WS_CHAT_AUTH_HEADER_NAME', label: 'Auth Header Name', placeholder: 'Authorization', hint: 'HTTP header name sent during the WebSocket upgrade handshake for authentication, e.g. "Authorization" or "X-Api-Key".' },
      { key: 'WS_CHAT_AUTH_HEADER_VALUE', label: 'Auth Header Value', placeholder: 'Bearer eyJ...', hint: 'Value for the authentication header, e.g. "Bearer <token>" or your API key string.', sensitive: true },
      { key: 'WS_CHAT_SUBPROTOCOL', label: 'Sub-Protocol', placeholder: 'chat', hint: 'WebSocket Sec-WebSocket-Protocol header value, e.g. "chat" or "json". Only set if your server requires it.' },
      { key: 'WS_CHAT_INIT_JSON', label: 'Init JSON', placeholder: '{"type":"init","version":"1"}', hint: 'JSON payload sent immediately after the socket opens (handshake/session init). Leave blank if no init frame is needed.' },
      { key: 'WS_CHAT_SEND_TEMPLATE', label: 'Send Template', placeholder: '{"type":"message","text":"{{message}}"}', hint: 'JSON template for outgoing messages. Use {{message}} as the placeholder — the text is JSON-escaped before insertion. Leave blank to send raw text frames.' },
      { key: 'WS_CHAT_AGENT_EVENT_TYPES', label: 'Agent Event Types', placeholder: 'agent,assistant,message', hint: 'Comma-separated list of JSON "type" field values to accept as agent replies. Leave blank to accept all incoming frames.' },
      { key: 'WS_CHAT_MESSAGE_PATH', label: 'Response Message Path', placeholder: 'body.text', hint: 'Dot-notation path to extract reply text from JSON frames, e.g. "body.text" or "data.content". Leave blank to treat the entire frame as raw text.' },
      // Voice (WebSocket) — fill these to run this provider on the voice channel.
      ...VOICE_WS_FIELDS,
    ],
  },
};

/** Provider type → its config env-var keys. Used to strip a provider's keyspace
 *  before overlaying a selected instance, and to validate incoming config. */
export const PROVIDER_FIELD_GROUPS: Record<RunProvider, string[]> = Object.fromEntries(
  RUN_PROVIDERS.map((type) => [type, PROVIDER_DEFS[type].fields.map((f) => f.key)]),
) as Record<RunProvider, string[]>;

/** All secret field keys across every provider (for redaction). */
export const SECRET_PROVIDER_KEYS: ReadonlySet<string> = new Set(
  Object.values(PROVIDER_DEFS).flatMap((def) => def.fields.filter((f) => f.sensitive).map((f) => f.key)),
);

export function isRunProvider(value: string): value is RunProvider {
  return (RUN_PROVIDERS as readonly string[]).includes(value);
}

export function isSecretProviderKey(key: string): boolean {
  return SECRET_PROVIDER_KEYS.has(key);
}

export function providerConfigKeys(type: RunProvider): string[] {
  return PROVIDER_FIELD_GROUPS[type] ?? [];
}

export function providerTypeLabel(type: RunProvider): string {
  return PROVIDER_DEFS[type]?.label ?? type;
}

/** Required keys for a provider type, optionally narrowed to a channel. */
export function requiredProviderKeys(type: RunProvider, channel?: 'chat' | 'voice'): string[] {
  return PROVIDER_DEFS[type].fields
    .filter((f) => f.required && (!channel || !f.channel || f.channel === channel))
    .map((f) => f.key);
}
