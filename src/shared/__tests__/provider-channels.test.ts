import { describe, expect, it } from 'vitest';

import {
  CHAT_ONLY_PROVIDERS,
  VOICE_WS_PROVIDERS,
  isChatOnlyProvider,
  isVoiceWsProvider,
  providerCanVoice,
  supportedChannels,
} from '../provider-channels.js';

describe('provider-channels', () => {
  it('classifies text-only bot providers as chat-only', () => {
    for (const p of ['lex', 'azure', 'azure-openai', 'copilot']) {
      expect(isChatOnlyProvider(p)).toBe(true);
      expect(providerCanVoice(p)).toBe(false);
      expect(supportedChannels(p)).toEqual(['chat']);
    }
  });

  it('treats strands, openapi and websocket as voice-capable via a voice WS', () => {
    for (const p of ['strands', 'openapi', 'websocket', 'custom']) {
      expect(isChatOnlyProvider(p)).toBe(false);
      expect(isVoiceWsProvider(p)).toBe(true);
      expect(providerCanVoice(p)).toBe(true);
      expect(supportedChannels(p)).toEqual(['chat', 'voice']);
    }
  });

  it('keeps connect voice-capable but not a voice-WS provider', () => {
    expect(providerCanVoice('connect')).toBe(true);
    expect(isVoiceWsProvider('connect')).toBe(false);
    expect(supportedChannels('connect')).toEqual(['chat', 'voice']);
  });

  it('has disjoint chat-only and voice-WS sets', () => {
    for (const p of VOICE_WS_PROVIDERS) expect(CHAT_ONLY_PROVIDERS.has(p)).toBe(false);
  });
});
