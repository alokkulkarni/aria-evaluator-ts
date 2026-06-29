import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ complete: vi.fn(), fetch: vi.fn() }));
vi.mock('../judge/providers/bedrock.js', () => ({
  BedrockJudgeProvider: class {
    complete = mocks.complete;
  },
}));

import { verifyCitations } from './citation-verifier.js';

function plan(items: unknown[]): string {
  return JSON.stringify(items);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', mocks.fetch);
  // Allowlisted authoritative pages; off-allowlist + network errors handled below.
  mocks.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/COBS/9/2')) return { ok: true, url, text: async () => '<p>COBS 9.2 Assessing suitability — a firm must obtain the necessary information ...</p>' };
    if (url.includes('/COBS/2/1')) return { ok: true, url, text: async () => '<p>COBS 2.1.1 R Acting honestly, fairly and professionally ...</p>' };
    if (url.includes('art-99')) return { ok: true, url, text: async () => '<p>Article 5 Principles relating to processing ...</p>' }; // does NOT contain "Article 99"
    if (url.includes('blocked')) throw new Error('network down');
    return { ok: false, url, text: async () => '' };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('verifyCitations', () => {
  it('marks Verified only when the fetched official page contains the reference', async () => {
    mocks.complete.mockResolvedValue({
      text: plan([{ citation: 'FCA COBS 9.2R', matchPhrase: 'COBS 9.2', candidateUrls: ['https://handbook.fca.org.uk/handbook/COBS/9/2'], likelyReal: true }]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const [v] = await verifyCitations(['FCA COBS 9.2R'], 'banking/wealth-advisory');
    expect(v!.status).toBe('verified');
    expect(v!.sourceUrl).toContain('handbook.fca.org.uk');
  });

  it('marks a fabricated citation Not found', async () => {
    mocks.complete.mockResolvedValue({
      text: plan([{ citation: 'Imaginary Act 2025', matchPhrase: 'Imaginary Act 2025', candidateUrls: ['https://example.gov/imaginary'], likelyReal: false }]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const [v] = await verifyCitations(['Imaginary Act 2025'], 'ctx');
    expect(v!.status).toBe('not-found'); // example.gov is off-allowlist → not fetched; likelyReal=false
  });

  it('surfaces a suggested correction when the real reference differs', async () => {
    mocks.complete.mockResolvedValue({
      text: plan([{ citation: 'FCA COBS 2.1R (Advice)', matchPhrase: 'COBS 2.1.1', candidateUrls: ['https://handbook.fca.org.uk/handbook/COBS/2/1'], likelyReal: true, correctedCitation: 'FCA COBS 2.1.1R' }]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const [v] = await verifyCitations(['FCA COBS 2.1R (Advice)'], 'ctx');
    expect(v!.status).toBe('corrected');
    expect(v!.correctedCitation).toBe('FCA COBS 2.1.1R');
    expect(v!.sourceUrl).toContain('handbook.fca.org.uk');
  });

  it('does NOT falsely verify when an allowlisted page is fetched but lacks the reference', async () => {
    mocks.complete.mockResolvedValue({
      text: plan([{ citation: 'GDPR Art. 99', matchPhrase: 'Article 99', candidateUrls: ['https://gdpr-info.eu/art-99-gdpr/'], likelyReal: true }]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const [v] = await verifyCitations(['GDPR Art. 99'], 'ctx');
    expect(v!.status).toBe('unverified');
  });

  it('does not fetch off-allowlist URLs (SSRF guard) → unverified', async () => {
    mocks.complete.mockResolvedValue({
      text: plan([{ citation: 'Internal Rule', matchPhrase: 'secret', candidateUrls: ['http://169.254.169.254/latest/meta-data', 'https://evil.example/x'], likelyReal: true }]),
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });
    const [v] = await verifyCitations(['Internal Rule'], 'ctx');
    expect(v!.status).toBe('unverified');
    // Never attempted a fetch to a non-allowlisted host.
    for (const call of mocks.fetch.mock.calls) {
      expect(String(call[0])).not.toMatch(/169\.254|evil\.example/);
    }
  });

  it('returns Unverified verdicts (never throws) when the LLM call fails', async () => {
    mocks.complete.mockRejectedValue(new Error('bedrock down'));
    const out = await verifyCitations(['GDPR Art. 5', 'HIPAA 164.502'], 'ctx');
    expect(out).toHaveLength(2);
    expect(out.every((v) => v.status === 'unverified')).toBe(true);
  });
});
