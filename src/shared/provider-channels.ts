// src/shared/provider-channels.ts
// Single source of truth for which providers can run on which channel.
// Pure, browser-safe (no SDK/node imports) so the UI, API, and CLI all agree.
//
// Voice in ARIA requires an adapter that streams bidirectional audio. Two shapes
// exist:
//   • connect — native AWS Connect WebRTC/Chime voice.
//   • voice-WS providers — anything that exposes a bidirectional-audio WebSocket
//     endpoint, driven by the generic voice adapter (deepgram / agentcore /
//     generic-json protocols). custom, strands, openapi, and websocket all reuse
//     this same machinery, so they are voice-capable once a voice endpoint is
//     configured on the instance.
//
// The remaining bot providers (lex, azure, azure-openai, copilot) have no audio
// transport at all and are text-only.

import type { RunProvider } from './provider-fields.js';

export type Channel = 'chat' | 'voice';

/**
 * Bot providers with no audio transport — chat only, and can never do voice.
 */
export const CHAT_ONLY_PROVIDERS: ReadonlySet<RunProvider> = new Set<RunProvider>([
  'lex',
  'azure',
  'azure-openai',
  'copilot',
]);

/**
 * Providers that run voice by streaming audio over a WebSocket voice endpoint,
 * reusing the generic bidirectional-audio adapter. Requires a voice endpoint to
 * be configured on the instance (validated at run time).
 */
export const VOICE_WS_PROVIDERS: ReadonlySet<RunProvider> = new Set<RunProvider>([
  'custom',
  'strands',
  'openapi',
  'websocket',
]);

/** True for text-only bot providers (lex / azure / azure-openai / copilot). */
export function isChatOnlyProvider(provider: string): boolean {
  return CHAT_ONLY_PROVIDERS.has(provider as RunProvider);
}

/** True when the provider runs voice via a generic voice WebSocket endpoint. */
export function isVoiceWsProvider(provider: string): boolean {
  return VOICE_WS_PROVIDERS.has(provider as RunProvider);
}

/**
 * True when the provider can do voice at all — connect natively, or any voice-WS
 * provider (with a voice endpoint configured). The run-time channel validation
 * (see cli/run.ts) still enforces that the required voice settings are present.
 */
export function providerCanVoice(provider: string): boolean {
  return provider === 'connect' || isVoiceWsProvider(provider);
}

/**
 * Channels a provider can be selected for. Voice-capable providers always expose
 * voice (mirroring connect); a missing voice endpoint surfaces as a clear
 * run-time validation error rather than a hidden option.
 */
export function supportedChannels(provider: string): Channel[] {
  return providerCanVoice(provider) ? ['chat', 'voice'] : ['chat'];
}
