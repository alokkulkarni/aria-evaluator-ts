// src/conversation/__tests__/scenario-tags.test.ts
// Cross-cutting scenario tags (suites): load-time normalisation, OR-semantics
// filtering, and the scenario-doc round-trip for portal-authored scenarios.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import yaml from 'js-yaml';
import {
  filterScenariosByTags,
  loadScenariosFromFile,
} from '../scenario-loader.js';
import { normalizeScenarioDoc, parseScenarioDocuments } from '../scenario-doc.js';
import type { Scenario } from '../../types/index.js';

const tmpDirs: string[] = [];

function writeScenarioYaml(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'aria-scenario-tags-'));
  tmpDirs.push(dir);
  const filePath = join(dir, 'scenarios.yaml');
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

afterAll(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});

function scenario(name: string, tags?: string[]): Scenario {
  return { name, channel: 'chat', ...(tags ? { tags } : {}) };
}

describe('scenario-loader tag normalisation', () => {
  it('trims, lowercases, dedupes, and drops empty/non-string entries', () => {
    const file = writeScenarioYaml(`
name: Tagged Scenario
channel: chat
tags:
  - "  Smoke "
  - REGRESSION
  - smoke
  - ""
  - "   "
  - 42
  - null
`);
    const [loaded] = loadScenariosFromFile(file);
    expect(loaded?.tags).toEqual(['smoke', 'regression']);
  });

  it('leaves scenarios without a tags entry with no tags field', () => {
    const file = writeScenarioYaml(`
name: Untagged Scenario
channel: chat
`);
    const [loaded] = loadScenariosFromFile(file);
    expect(loaded).toBeDefined();
    expect(loaded).not.toHaveProperty('tags');
  });

  it('drops a tags field that is not an array', () => {
    const file = writeScenarioYaml(`
name: Bad Tags Scenario
channel: chat
tags: smoke
`);
    const [loaded] = loadScenariosFromFile(file);
    expect(loaded).toBeDefined();
    expect(loaded).not.toHaveProperty('tags');
  });

  it('drops a tags field whose entries are all junk', () => {
    const file = writeScenarioYaml(`
name: Junk Tags Scenario
channel: chat
tags:
  - ""
  - "   "
  - 7
`);
    const [loaded] = loadScenariosFromFile(file);
    expect(loaded).toBeDefined();
    expect(loaded).not.toHaveProperty('tags');
  });

  it('normalises tags independently per document in a multi-doc file', () => {
    const file = writeScenarioYaml(`
name: First
channel: chat
tags: [Smoke]
---
name: Second
channel: chat
`);
    const loaded = loadScenariosFromFile(file);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]?.tags).toEqual(['smoke']);
    expect(loaded[1]).not.toHaveProperty('tags');
  });
});

describe('filterScenariosByTags', () => {
  const scenarios: Scenario[] = [
    scenario('smoke-only', ['smoke']),
    scenario('regression-only', ['regression']),
    scenario('compliance-and-smoke', ['compliance', 'smoke']),
    scenario('untagged'),
  ];

  it('matches scenarios that have at least one requested tag (OR semantics)', () => {
    const result = filterScenariosByTags(scenarios, 'smoke,regression');
    expect(result.map((s) => s.name)).toEqual([
      'smoke-only',
      'regression-only',
      'compliance-and-smoke',
    ]);
  });

  it('matches on a single tag', () => {
    const result = filterScenariosByTags(scenarios, 'compliance');
    expect(result.map((s) => s.name)).toEqual(['compliance-and-smoke']);
  });

  it('matches case-insensitively in both the csv and the scenario tags', () => {
    const shouty = [scenario('shouty', ['SMOKE'])];
    expect(filterScenariosByTags(shouty, 'Smoke')).toHaveLength(1);
    expect(filterScenariosByTags(scenarios, ' SMOKE ').map((s) => s.name)).toEqual([
      'smoke-only',
      'compliance-and-smoke',
    ]);
  });

  it('returns the input unchanged for an undefined csv', () => {
    expect(filterScenariosByTags(scenarios, undefined)).toBe(scenarios);
  });

  it('returns the input unchanged for an empty or whitespace/comma-only csv', () => {
    expect(filterScenariosByTags(scenarios, '')).toBe(scenarios);
    expect(filterScenariosByTags(scenarios, ' , ,')).toBe(scenarios);
  });

  it('returns an empty array when no scenario carries a requested tag', () => {
    expect(filterScenariosByTags(scenarios, 'nonexistent')).toEqual([]);
  });

  it('never matches untagged scenarios when a tag filter is active', () => {
    const result = filterScenariosByTags(scenarios, 'smoke,regression,compliance');
    expect(result.map((s) => s.name)).not.toContain('untagged');
  });
});

describe('scenario-doc tags passthrough', () => {
  it('normalizeScenarioDoc round-trips tags into yamlContent', () => {
    const { doc, details } = normalizeScenarioDoc(
      { name: 'Portal Tagged', channel: 'chat', tags: ['smoke', 'compliance'] },
      1,
      true,
    );
    expect(details).toEqual([]);
    expect(doc).not.toBeNull();
    const parsed = yaml.load(doc!.yamlContent) as Record<string, unknown>;
    expect(parsed['tags']).toEqual(['smoke', 'compliance']);
  });

  it('parseScenarioDocuments preserves tags in the normalized yaml', () => {
    const { docs, details } = parseScenarioDocuments(
      'name: Portal Tagged\nchannel: chat\ntags: [smoke]\n',
      { assignScenarioId: true },
    );
    expect(details).toEqual([]);
    expect(docs).toHaveLength(1);
    const parsed = yaml.load(docs[0]!.yamlContent) as Record<string, unknown>;
    expect(parsed['tags']).toEqual(['smoke']);
  });
});
