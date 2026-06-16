// src/conversation/scenario-doc.ts
// Pure scenario-document helpers: parsing, validation, normalization, and the
// stable scenario key. Shared by the HTTP routes (routes/scenarios.ts) and the
// DB-authoritative store (scenario-store.ts) so normalization — and therefore
// the contentHash used to dedup revisions — is computed in exactly one place.

import { createHash, randomUUID } from 'node:crypto';
import yaml from 'js-yaml';

export const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,79}$/;
export const LIFECYCLE_STATUS = new Set(['draft', 'active', 'deprecated']);

export type ScenarioLifecycleStatus = 'draft' | 'active' | 'deprecated';

export interface NormalizedScenarioDoc {
  scenarioId: string;
  name: string;
  channel: 'chat' | 'voice' | 'both';
  description: string | null;
  yamlContent: string;
  contentHash: string;
}

export interface ParsedDocumentsResult {
  docs: NormalizedScenarioDoc[];
  details: string[];
}

export function makeScenarioKey(scenarioId: string): string {
  return `scenario:${scenarioId}`;
}

/**
 * Derive a STABLE scenario_id from a sourceRef (`relpath.yaml#index`) for docs
 * that ship without one (the bundled library has none). Must be deterministic so
 * re-importing the same file is idempotent — a random id would create a new row
 * on every restart. Always satisfies SCENARIO_ID_PATTERN.
 */
export function deterministicScenarioId(sourceRef: string): string {
  const slug = sourceRef
    .toLowerCase()
    .replace(/\.ya?ml/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = slug.length >= 3 ? slug : `scenario_${slug}`.replace(/_+$/g, '');
  if (base.length <= 80 && SCENARIO_ID_PATTERN.test(base)) return base;

  // Too long / invalid → truncate and append a stable hash to avoid collisions.
  const hash = createHash('sha256').update(sourceRef).digest('hex').slice(0, 8);
  const truncated = base.slice(0, 60).replace(/_+$/g, '');
  const candidate = `${truncated}_${hash}`;
  return SCENARIO_ID_PATTERN.test(candidate) ? candidate : `scenario_${hash}`;
}

function slugifyScenarioId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  return `${base || 'scenario'}_${suffix}`;
}

function normalizeScenarioId(raw: unknown, nameHint: string, assignIfMissing: boolean): string {
  if (typeof raw === 'string' && raw.trim()) {
    const candidate = raw.trim().toLowerCase();
    if (!SCENARIO_ID_PATTERN.test(candidate)) {
      throw new Error('scenario_id must match /^[a-z0-9][a-z0-9_-]{2,79}$/');
    }
    return candidate;
  }
  if (!assignIfMissing) {
    throw new Error('scenario_id is required');
  }
  return slugifyScenarioId(nameHint);
}

function getDocSendValue(turn: unknown): string {
  if (!turn || typeof turn !== 'object') return '';
  const row = turn as Record<string, unknown>;
  if (typeof row['send'] === 'string') return row['send'];
  if (typeof row['customer'] === 'string') return row['customer'];
  if (typeof row['content'] === 'string') return row['content'];
  if (typeof row['message'] === 'string') return row['message'];
  return '';
}

function validateScenarioDocShape(doc: Record<string, unknown>, docNumber: number): string[] {
  const errors: string[] = [];

  const name = doc['name'];
  if (typeof name !== 'string' || !name.trim()) {
    errors.push(`Document ${docNumber}: name is required`);
  }

  const channel = doc['channel'];
  if (channel !== 'chat' && channel !== 'voice' && channel !== 'both') {
    errors.push(`Document ${docNumber}: channel must be one of chat, voice, or both`);
  }

  const mode = doc['mode'];
  if (mode != null && mode !== 'agent' && mode !== 'script') {
    errors.push(`Document ${docNumber}: mode must be either agent or script`);
  }

  const attackType = doc['attack_type'];
  if (attackType != null && (typeof attackType !== 'string' || !attackType.trim())) {
    errors.push(`Document ${docNumber}: attack_type must be a non-empty string when provided`);
  }

  if (mode === 'script') {
    const turns = doc['turns'];
    if (!Array.isArray(turns) || turns.length === 0) {
      errors.push(`Document ${docNumber}: script mode requires at least one turn`);
    } else {
      turns.forEach((turn, index) => {
        if (!getDocSendValue(turn).trim()) {
          errors.push(`Document ${docNumber}: turn ${index + 1} must include send/customer/content/message text`);
        }
      });
    }
  }

  const maxTurns = doc['max_turns'];
  if (maxTurns != null && (!Number.isInteger(maxTurns) || Number(maxTurns) <= 0)) {
    errors.push(`Document ${docNumber}: max_turns must be a positive integer when provided`);
  }

  const defaultTimeout = doc['default_timeout_seconds'];
  if (defaultTimeout != null && (!Number.isInteger(defaultTimeout) || Number(defaultTimeout) <= 0)) {
    errors.push(`Document ${docNumber}: default_timeout_seconds must be a positive integer when provided`);
  }

  const delay = doc['turn_delay_seconds'];
  if (delay != null && (typeof delay !== 'number' || !Number.isFinite(delay) || delay < 0)) {
    errors.push(`Document ${docNumber}: turn_delay_seconds must be a non-negative number when provided`);
  }

  return errors;
}

export function normalizeScenarioDoc(
  inputDoc: unknown,
  docNumber: number,
  assignScenarioId: boolean,
): { doc: NormalizedScenarioDoc | null; details: string[] } {
  if (!inputDoc || typeof inputDoc !== 'object' || Array.isArray(inputDoc)) {
    return { doc: null, details: [`Document ${docNumber}: must be a YAML object`] };
  }

  const doc = { ...(inputDoc as Record<string, unknown>) };
  const details = validateScenarioDocShape(doc, docNumber);
  if (details.length > 0) return { doc: null, details };

  const name = String(doc['name'] ?? '').trim();
  let scenarioId: string;
  try {
    scenarioId = normalizeScenarioId(doc['scenario_id'], name, assignScenarioId);
  } catch (err) {
    return { doc: null, details: [`Document ${docNumber}: ${(err as Error).message}`] };
  }

  doc['scenario_id'] = scenarioId;
  const yamlContent = yaml.dump(doc, { lineWidth: -1, noRefs: true }).trimEnd();
  const canonicalYaml = yaml.dump(doc, { lineWidth: -1, noRefs: true, sortKeys: true }).trimEnd();
  const contentHash = createHash('sha256').update(canonicalYaml).digest('hex');

  return {
    doc: {
      scenarioId,
      name,
      channel: doc['channel'] as 'chat' | 'voice' | 'both',
      description: typeof doc['description'] === 'string' && doc['description'].trim()
        ? doc['description'].trim()
        : null,
      yamlContent,
      contentHash,
    },
    details: [],
  };
}

export function parseScenarioDocuments(
  content: string,
  options?: { enforceSingleDoc?: boolean; assignScenarioId?: boolean },
): ParsedDocumentsResult {
  const details: string[] = [];
  let parsedDocs: unknown[] = [];

  try {
    parsedDocs = yaml.loadAll(content).filter((doc) => doc != null);
  } catch (err) {
    return { docs: [], details: [`Invalid YAML: ${(err as Error).message}`] };
  }

  if (parsedDocs.length === 0) {
    return { docs: [], details: ['YAML must contain at least one scenario document'] };
  }
  if (options?.enforceSingleDoc && parsedDocs.length !== 1) {
    return { docs: [], details: ['Exactly one YAML document is required'] };
  }

  const docs: NormalizedScenarioDoc[] = [];
  const seenScenarioIds = new Map<string, number>();
  parsedDocs.forEach((parsedDoc, index) => {
    const normalized = normalizeScenarioDoc(parsedDoc, index + 1, options?.assignScenarioId ?? false);
    details.push(...normalized.details);
    if (!normalized.doc) return;

    const previousDocNumber = seenScenarioIds.get(normalized.doc.scenarioId);
    if (previousDocNumber != null) {
      details.push(`Document ${index + 1}: duplicate scenario_id "${normalized.doc.scenarioId}" (already used in document ${previousDocNumber})`);
      return;
    }

    seenScenarioIds.set(normalized.doc.scenarioId, index + 1);
    docs.push(normalized.doc);
  });

  return { docs, details };
}

export function parseLifecycleStatus(raw: unknown): ScenarioLifecycleStatus | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!LIFECYCLE_STATUS.has(value)) return null;
  return value as ScenarioLifecycleStatus;
}

export function parseOwner(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const owner = raw.trim();
  if (!owner) return null;
  return owner.slice(0, 128);
}

export function parseScenarioId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const scenarioId = raw.trim().toLowerCase();
  if (!SCENARIO_ID_PATTERN.test(scenarioId)) return null;
  return scenarioId;
}
