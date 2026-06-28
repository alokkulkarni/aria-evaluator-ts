import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { appPaths } from '../runtime/paths.js';
import { loadDomainTaxonomy, loadKnowledgeBase } from './data.js';
import { getRecommendations } from './engine.js';

// Every domain + sub-function offered in the taxonomy must resolve to a real,
// well-formed set of guardrails — otherwise the wizard shows a platform/recs step
// with nothing in it. This guards against taxonomy ↔ knowledge-base drift.
describe('knowledge base completeness', () => {
  const taxonomy = loadDomainTaxonomy();

  for (const domain of taxonomy.domains) {
    for (const sf of domain.subFunctions) {
      it(`has well-formed guardrails for ${domain.id}:${sf.id}`, async () => {
        const recs = await getRecommendations(domain.id, sf.id, {});

        expect(recs.length).toBeGreaterThan(0);
        expect(recs.some((r) => r.severity === 'REQUIRED')).toBe(true);
        // Guardrail ids must be unique within an entry (the engine does not dedup
        // within a single entry → duplicate ids would yield duplicate configs).
        expect(new Set(recs.map((r) => r.id)).size).toBe(recs.length);

        for (const r of recs) {
          expect(r.id).toBeTruthy();
          expect(r.guardrailType).toBeTruthy();
          expect(r.title).toBeTruthy();
          expect(r.description).toBeTruthy();
          expect(r.rationale).toBeTruthy();
          expect(Array.isArray(r.regulations)).toBe(true);
          expect(r.regulations.length).toBeGreaterThan(0);
        }
      });
    }
  }

  it('has well-formed guardrails in every entry, including augment entries', () => {
    // The per-sub-function loop above only covers taxonomy keys; augment entries
    // (jurisdiction:*, autonomy:*, data:*, users:*) are exercised here too.
    const kb = loadKnowledgeBase();
    for (const [key, entry] of Object.entries(kb)) {
      const items = [
        ...(entry.required ?? []),
        ...(entry.recommended ?? []),
        ...(entry.optional ?? []),
      ];
      expect(items.length, `entry ${key} has guardrails`).toBeGreaterThan(0);
      for (const g of items) {
        expect(g.id, `${key} id`).toBeTruthy();
        expect(g.type, `${key}:${g.id} type`).toBeTruthy();
        expect(g.title, `${key}:${g.id} title`).toBeTruthy();
        expect(g.rationale, `${key}:${g.id} rationale`).toBeTruthy();
        expect(Array.isArray(g.regulations) && g.regulations.length > 0, `${key}:${g.id} citations`).toBe(true);
      }
    }
  });

  it('has no duplicate domain:subFunction keys in the raw JSON (parse silently drops dups)', () => {
    const raw = readFileSync(
      join(appPaths.projectRoot, 'src', 'guardrail', 'guardrail-knowledge.json'),
      'utf-8',
    );
    // Match top-level entry keys (an object value), e.g. "banking:loan-application": {
    const keys = [...raw.matchAll(/"([a-z-]+:[a-z0-9-]+)"\s*:\s*\{/g)].map((m) => m[1]);
    const seen = new Set<string>();
    const dups = keys.filter((k) => (seen.has(k!) ? true : (seen.add(k!), false)));
    expect(dups).toEqual([]);
  });
});
