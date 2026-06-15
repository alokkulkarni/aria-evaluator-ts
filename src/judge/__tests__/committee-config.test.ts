import { describe, expect, it } from 'vitest';

import {
  availableProviders,
  buildDefaultCommittee,
  committeeLabel,
  computeJudgeConfigHash,
  parseCommitteeJson,
  providerAvailable,
  routeJudges,
  scenarioCategory,
  validateCommittee,
  vendorForSpec,
  type JudgeCommitteeConfig,
  type JudgeSpec,
} from '../../shared/judge-committee.js';

const baseParams = {
  bedrockModelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
  systemPrompt: 'sys',
  temperature: 0,
  maxTokens: 1200,
  disagreementThreshold: 2,
};

describe('buildDefaultCommittee', () => {
  it('is a 3-judge cross-vendor committee when OpenAI is available', () => {
    const c = buildDefaultCommittee({ ...baseParams, availableProviders: new Set(['bedrock', 'openai']) });
    expect(c.judges).toHaveLength(3);
    const vendors = new Set(c.judges.map((j) => vendorForSpec(j)));
    expect(vendors.has('openai')).toBe(true);
    expect(vendors.size).toBeGreaterThanOrEqual(3); // anthropic + openai + amazon
  });

  it('degrades to Bedrock-only judges when no external creds', () => {
    const c = buildDefaultCommittee({ ...baseParams, availableProviders: new Set(['bedrock']) });
    expect(c.judges.every((j) => j.provider === 'bedrock')).toBe(true);
    expect(c.judges.length).toBeGreaterThanOrEqual(1);
  });
});

describe('validateCommittee', () => {
  const ok: JudgeCommitteeConfig = {
    judges: [{ id: 'a', provider: 'bedrock', modelId: 'm' }],
    disagreementThreshold: 2,
    aggregation: 'mean',
    systemPrompt: 's',
  };

  it('accepts a valid committee', () => {
    expect(() => validateCommittee(ok)).not.toThrow();
  });

  it('rejects empty judges', () => {
    expect(() => validateCommittee({ ...ok, judges: [] })).toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      validateCommittee({
        ...ok,
        judges: [
          { id: 'a', provider: 'bedrock', modelId: 'm' },
          { id: 'a', provider: 'openai', modelId: 'gpt-4o' },
        ],
      }),
    ).toThrow();
  });

  it('rejects unknown providers and missing modelId', () => {
    expect(() =>
      validateCommittee({ ...ok, judges: [{ id: 'x', provider: 'nope' as never, modelId: 'm' }] }),
    ).toThrow();
    expect(() =>
      validateCommittee({ ...ok, judges: [{ id: 'x', provider: 'openai', modelId: '' }] }),
    ).toThrow();
  });

  it('rejects out-of-range disagreement threshold', () => {
    expect(() => validateCommittee({ ...ok, disagreementThreshold: 99 })).toThrow();
  });
});

describe('parseCommitteeJson', () => {
  it('parses and validates a committee', () => {
    const json = JSON.stringify({
      judges: [{ id: 'a', provider: 'openai', modelId: 'gpt-4o' }],
      disagreementThreshold: 3,
    });
    const c = parseCommitteeJson(json, 'fallback-prompt');
    expect(c.judges).toHaveLength(1);
    expect(c.disagreementThreshold).toBe(3);
    expect(c.systemPrompt).toBe('fallback-prompt');
  });

  it('throws on structurally invalid committee', () => {
    expect(() => parseCommitteeJson('{"judges":[]}', 's')).toThrow();
  });
});

describe('computeJudgeConfigHash', () => {
  it('is deterministic and order-independent', () => {
    const a: JudgeCommitteeConfig = {
      judges: [
        { id: 'a', provider: 'bedrock', modelId: 'm1' },
        { id: 'b', provider: 'openai', modelId: 'gpt-4o' },
      ],
      disagreementThreshold: 2,
      aggregation: 'mean',
      systemPrompt: 's',
    };
    const b: JudgeCommitteeConfig = { ...a, judges: [a.judges[1]!, a.judges[0]!] };
    expect(computeJudgeConfigHash(a)).toBe(computeJudgeConfigHash(b));
  });

  it('changes when a judge model changes', () => {
    const a: JudgeCommitteeConfig = {
      judges: [{ id: 'a', provider: 'bedrock', modelId: 'm1' }],
      disagreementThreshold: 2,
      aggregation: 'mean',
      systemPrompt: 's',
    };
    const b: JudgeCommitteeConfig = { ...a, judges: [{ id: 'a', provider: 'bedrock', modelId: 'm2' }] };
    expect(computeJudgeConfigHash(a)).not.toBe(computeJudgeConfigHash(b));
  });
});

describe('committeeLabel + vendorForSpec', () => {
  it('labels single vs multi committees', () => {
    expect(committeeLabel({ judges: [{ id: 'a', provider: 'openai', modelId: 'gpt-4o' }], disagreementThreshold: 2, aggregation: 'mean', systemPrompt: 's' })).toBe('gpt-4o');
    expect(
      committeeLabel({
        judges: [
          { id: 'a', provider: 'bedrock', modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0' },
          { id: 'b', provider: 'openai', modelId: 'gpt-4o' },
        ],
        disagreementThreshold: 2,
        aggregation: 'mean',
        systemPrompt: 's',
      }),
    ).toMatch(/^committee:/);
  });

  it('maps providers/models to vendor families', () => {
    expect(vendorForSpec({ provider: 'openai', modelId: 'gpt-4o' })).toBe('openai');
    expect(vendorForSpec({ provider: 'azure-openai', modelId: 'dep' })).toBe('openai');
    expect(vendorForSpec({ provider: 'anthropic', modelId: 'claude-sonnet-4-5' })).toBe('anthropic');
    expect(vendorForSpec({ provider: 'gemini', modelId: 'gemini-2.0-flash' })).toBe('google');
    expect(vendorForSpec({ provider: 'bedrock', modelId: 'eu.amazon.nova-pro-v1:0' })).toBe('amazon');
  });
});

describe('scenarioCategory + routeJudges (specialist routing)', () => {
  const G: JudgeSpec = { id: 'g', provider: 'bedrock', modelId: 'claude', role: 'generalist' };
  const S: JudgeSpec = { id: 's', provider: 'openai', modelId: 'gpt-4o', role: 'security' };
  const D: JudgeSpec = { id: 'd', provider: 'bedrock', modelId: 'nova', role: 'domain' };
  const U: JudgeSpec = { id: 'u', provider: 'bedrock', modelId: 'mistral' }; // no role → generalist

  it('categorises scenarios (adversarial wins over domain)', () => {
    expect(scenarioCategory({ attack_type: 'prompt_injection' })).toBe('security');
    expect(scenarioCategory({ domain: 'financial' })).toBe('domain');
    expect(scenarioCategory({})).toBe('generalist');
    expect(scenarioCategory({ attack_type: 'x', domain: 'financial' })).toBe('security');
  });

  it('security scenarios route to security specialists + generalists (domain excluded)', () => {
    expect(routeJudges([G, S, D], 'security').map((j) => j.id)).toEqual(['g', 's']);
  });

  it('domain scenarios route to domain specialists + generalists (security excluded)', () => {
    expect(routeJudges([G, S, D], 'domain').map((j) => j.id)).toEqual(['g', 'd']);
  });

  it('generic scenarios use generalists only (all specialists excluded)', () => {
    expect(routeJudges([G, S, D, U], 'generalist').map((j) => j.id)).toEqual(['g', 'u']);
  });

  it('falls back to all judges when nothing matches the category', () => {
    expect(routeJudges([S], 'domain').map((j) => j.id)).toEqual(['s']);
  });
});

describe('providerAvailable', () => {
  it('treats bedrock as always available and others as key-gated', () => {
    const env = { OPENAI_API_KEY: 'x', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_ENDPOINT: 'https://e' };
    expect(providerAvailable('bedrock', env)).toBe(true);
    expect(providerAvailable('openai', env)).toBe(true);
    expect(providerAvailable('azure-openai', env)).toBe(true);
    expect(providerAvailable('anthropic', env)).toBe(false);
    expect(providerAvailable('gemini', {})).toBe(false);
    expect(availableProviders(env).has('openai')).toBe(true);
  });
});
