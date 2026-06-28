// Loaders for the Guardrail Advisor's static data files. The JSON files live under
// src/guardrail/ and are read at runtime (the prod image ships the source tree, and
// dev/tests run from the project root) — resolved from the project root, matching
// the codebase's path convention in src/runtime/paths.ts. Results are cached.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appPaths } from '../runtime/paths.js';
import type { DomainTaxonomy, GuardrailKnowledgeBase } from './types.js';

const GUARDRAIL_DIR = join(appPaths.projectRoot, 'src', 'guardrail');

let taxonomyCache: DomainTaxonomy | null = null;
let knowledgeCache: GuardrailKnowledgeBase | null = null;

export function loadDomainTaxonomy(): DomainTaxonomy {
  if (!taxonomyCache) {
    const raw = readFileSync(join(GUARDRAIL_DIR, 'domain-taxonomy.json'), 'utf-8');
    taxonomyCache = JSON.parse(raw) as DomainTaxonomy;
  }
  return taxonomyCache;
}

export function loadKnowledgeBase(): GuardrailKnowledgeBase {
  if (!knowledgeCache) {
    const raw = readFileSync(join(GUARDRAIL_DIR, 'guardrail-knowledge.json'), 'utf-8');
    knowledgeCache = JSON.parse(raw) as GuardrailKnowledgeBase;
  }
  return knowledgeCache;
}
