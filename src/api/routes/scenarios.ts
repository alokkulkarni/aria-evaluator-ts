import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { Router } from 'express';
import yaml from 'js-yaml';

import { getRequestAuth } from '../auth.js';
import { prisma } from '../../db/client.js';
import { loadScenariosFromDir } from '../../conversation/scenario-loader.js';
import type { Scenario } from '../../types/scenario.js';

export const scenariosRouter = Router();

const SCENARIOS_DIR = resolve(
  process.env['SCENARIOS_DIR'] ?? join('..', 'aria-evaluator-v2', 'scenarios'),
);

const SCENARIO_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,79}$/;
const LIFECYCLE_STATUS = new Set(['draft', 'active', 'deprecated']);

type ScenarioLifecycleStatus = 'draft' | 'active' | 'deprecated';

interface NormalizedScenarioDoc {
  scenarioId: string;
  name: string;
  channel: 'chat' | 'voice' | 'both';
  description: string | null;
  yamlContent: string;
  contentHash: string;
}

interface ParsedDocumentsResult {
  docs: NormalizedScenarioDoc[];
  details: string[];
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replace(/\\/g, '/');
}

function sanitizeRelativeYamlPath(input: string): string | null {
  const normalized = normalizePathSeparators(input.trim());
  if (!normalized || normalized.includes('\0') || normalized.startsWith('/')) return null;

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((segment) => segment === '.' || segment === '..')) return null;

  const output = segments.join('/');
  if (!/\.ya?ml$/i.test(output)) return null;
  return output;
}

function resolveScenarioFilePath(input: string): { filePath: string; fullPath: string } | null {
  const filePath = sanitizeRelativeYamlPath(input);
  if (!filePath) return null;

  const fullPath = resolve(SCENARIOS_DIR, filePath);
  const rel = relative(SCENARIOS_DIR, fullPath);
  if (rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) return null;
  return { filePath, fullPath };
}

function parseScenarioRef(input: string): { scenarioRef: string; filePath: string; fullPath: string; docIndex: number } | null {
  const [rawPath, rawIndex] = input.split('#');
  if (!rawPath || rawIndex == null) return null;

  const resolvedPath = resolveScenarioFilePath(rawPath);
  if (!resolvedPath) return null;

  const docIndex = Number.parseInt(rawIndex, 10);
  if (!Number.isFinite(docIndex) || docIndex < 0) return null;

  return {
    scenarioRef: `${resolvedPath.filePath}#${docIndex}`,
    filePath: resolvedPath.filePath,
    fullPath: resolvedPath.fullPath,
    docIndex,
  };
}

function makeScenarioKey(scenarioId: string): string {
  return `scenario:${scenarioId}`;
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

function validateScenarioDocShape(
  doc: Record<string, unknown>,
  docNumber: number,
): string[] {
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

function normalizeScenarioDoc(
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

function parseScenarioDocuments(content: string, options?: { enforceSingleDoc?: boolean; assignScenarioId?: boolean }): ParsedDocumentsResult {
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

function walkYaml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkYaml(fullPath);
    if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) return [relative(SCENARIOS_DIR, fullPath)];
    return [];
  });
}

function splitMultiDoc(content: string): { preamble: string; docs: string[] } {
  const rawParts = content.split(/^---\s*$/m);
  if (rawParts.length <= 1) {
    const doc = content.trim();
    return { preamble: '', docs: doc ? [doc] : [] };
  }

  const parts = rawParts.map((part) => part.trim()).filter(Boolean);
  if (parts[0] && /^#/.test(parts[0])) {
    return { preamble: parts[0], docs: parts.slice(1) };
  }
  return { preamble: '', docs: parts };
}

function joinMultiDoc(preamble: string, docs: string[]): string {
  const sections = preamble ? [preamble] : [];
  for (const doc of docs) sections.push(`---\n${doc.trimEnd()}`);
  return `${sections.join('\n')}\n`;
}

async function upsertScenarioState(
  normalizedDoc: NormalizedScenarioDoc,
  sourceRef: string,
  source: 'create' | 'edit' | 'sync',
  changedBy: string | null,
  metadata?: { owner?: string | null; lifecycleStatus?: ScenarioLifecycleStatus },
): Promise<void> {
  const key = makeScenarioKey(normalizedDoc.scenarioId);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.scenario.findUnique({
      where: { filePath: key },
      select: { id: true, contentHash: true, owner: true, lifecycleStatus: true },
    });

    const scenario = existing
      ? await tx.scenario.update({
        where: { filePath: key },
        data: {
          sourceRef,
          name: normalizedDoc.name,
          channel: normalizedDoc.channel,
          description: normalizedDoc.description,
          yamlContent: normalizedDoc.yamlContent,
          contentHash: normalizedDoc.contentHash,
          owner: metadata?.owner !== undefined ? metadata.owner : existing.owner,
          lifecycleStatus: metadata?.lifecycleStatus ?? existing.lifecycleStatus,
        },
        select: { id: true },
      })
      : await tx.scenario.create({
        data: {
          filePath: key,
          sourceRef,
          name: normalizedDoc.name,
          channel: normalizedDoc.channel,
          description: normalizedDoc.description,
          yamlContent: normalizedDoc.yamlContent,
          contentHash: normalizedDoc.contentHash,
          owner: metadata?.owner ?? null,
          lifecycleStatus: metadata?.lifecycleStatus ?? 'active',
          lastRevisionAt: now,
        },
        select: { id: true },
      });

    const shouldRecordRevision = !existing || existing.contentHash !== normalizedDoc.contentHash;
    if (!shouldRecordRevision) return;

    await tx.scenarioRevision.upsert({
      where: {
        scenarioId_contentHash: {
          scenarioId: scenario.id,
          contentHash: normalizedDoc.contentHash,
        },
      },
      update: {
        sourceRef,
        yamlContent: normalizedDoc.yamlContent,
        source,
        changedBy,
      },
      create: {
        scenarioId: scenario.id,
        sourceRef,
        yamlContent: normalizedDoc.yamlContent,
        contentHash: normalizedDoc.contentHash,
        source,
        changedBy,
      },
    });

    await tx.scenario.update({
      where: { id: scenario.id },
      data: { lastRevisionAt: now },
    });
  });
}

function parseLifecycleStatus(raw: unknown): ScenarioLifecycleStatus | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (!LIFECYCLE_STATUS.has(value)) return null;
  return value as ScenarioLifecycleStatus;
}

function parseOwner(raw: unknown): string | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  const owner = raw.trim();
  if (!owner) return null;
  return owner.slice(0, 128);
}

function parseScenarioId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const scenarioId = raw.trim().toLowerCase();
  if (!SCENARIO_ID_PATTERN.test(scenarioId)) return null;
  return scenarioId;
}

function readDocFromRef(filePath: string, fullPath: string, docIndex: number): { docText: string; preamble: string; docs: string[] } | null {
  if (!existsSync(fullPath)) return null;
  const raw = readFileSync(fullPath, 'utf-8');
  const { preamble, docs } = splitMultiDoc(raw);
  if (docIndex < 0 || docIndex >= docs.length) return null;
  const docText = docs[docIndex]?.trim();
  if (!docText) return null;
  return { docText, preamble, docs };
}

function getScenarioMetadataByKey(
  records: Array<{
    filePath: string;
    sourceRef: string | null;
    owner: string | null;
    lifecycleStatus: string;
    lastRevisionAt: Date | null;
    _count: { revisions: number };
  }>,
  scenario: Scenario,
): { owner: string | null; lifecycleStatus: ScenarioLifecycleStatus; revisionCount: number; lastRevisionAt: string | null } | null {
  const sourceRef = scenario.filePath ?? null;
  const scenarioId = parseScenarioId(scenario.scenario_id);
  const key = scenarioId ? makeScenarioKey(scenarioId) : null;

  const match = (key
    ? records.find((record) => record.filePath === key)
    : null)
    ?? (sourceRef ? records.find((record) => record.sourceRef === sourceRef) : null);
  if (!match) return null;

  const lifecycleStatus = parseLifecycleStatus(match.lifecycleStatus) ?? 'active';
  return {
    owner: match.owner,
    lifecycleStatus,
    revisionCount: match._count.revisions,
    lastRevisionAt: match.lastRevisionAt?.toISOString() ?? null,
  };
}

// GET /api/scenarios — list all scenarios (YAML is source of truth; DB augments metadata only)
scenariosRouter.get('/', async (_req, res) => {
  try {
    if (!existsSync(SCENARIOS_DIR)) {
      return res.json({ scenarios: [], dir: SCENARIOS_DIR, error: 'Directory not found' });
    }

    const scenarios = loadScenariosFromDir(SCENARIOS_DIR);
    const scenarioKeys = scenarios
      .map((scenario) => parseScenarioId(scenario.scenario_id))
      .filter((scenarioId): scenarioId is string => !!scenarioId)
      .map((scenarioId) => makeScenarioKey(scenarioId));
    const sourceRefs = scenarios
      .map((scenario) => scenario.filePath?.trim() ?? '')
      .filter(Boolean);

    const records = scenarioKeys.length > 0 || sourceRefs.length > 0
      ? await prisma.scenario.findMany({
        where: {
          OR: [
            ...(scenarioKeys.length > 0 ? [{ filePath: { in: scenarioKeys } }] : []),
            ...(sourceRefs.length > 0 ? [{ sourceRef: { in: sourceRefs } }] : []),
          ],
        },
        select: {
          filePath: true,
          sourceRef: true,
          owner: true,
          lifecycleStatus: true,
          lastRevisionAt: true,
          _count: { select: { revisions: true } },
        },
      })
      : [];

    const enrichedScenarios = scenarios.map((scenario) => {
      const metadata = getScenarioMetadataByKey(records, scenario);
      if (!metadata) return scenario;
      return {
        ...scenario,
        owner: metadata.owner,
        lifecycle_status: metadata.lifecycleStatus,
        revision_count: metadata.revisionCount,
        last_revision_at: metadata.lastRevisionAt,
      };
    });

    res.json({ scenarios: enrichedScenarios, total: enrichedScenarios.length, dir: SCENARIOS_DIR });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/files — list YAML files
scenariosRouter.get('/files', (_req, res) => {
  try {
    const files = walkYaml(SCENARIOS_DIR).sort();
    res.json({ files, dir: SCENARIOS_DIR });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/file?path=banking/account_query.yaml — get raw YAML
scenariosRouter.get('/file', (req, res) => {
  const pathInput = req.query['path'];
  if (typeof pathInput !== 'string' || !pathInput.trim()) {
    return res.status(400).json({ error: 'path query param required' });
  }

  const resolvedPath = resolveScenarioFilePath(pathInput);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });
  if (!existsSync(resolvedPath.fullPath)) return res.status(404).json({ error: 'File not found' });

  const content = readFileSync(resolvedPath.fullPath, 'utf-8');
  res.json({ path: resolvedPath.filePath, content });
});

// GET /api/scenarios/folders — list subdirectory names for the file location picker
scenariosRouter.get('/folders', (_req, res) => {
  try {
    if (!existsSync(SCENARIOS_DIR)) return res.json({ folders: [] });
    const folders = readdirSync(SCENARIOS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    res.json({ folders });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/revisions?scenarioId=...
scenariosRouter.get('/revisions', async (req, res) => {
  const scenarioId = parseScenarioId(req.query['scenarioId']);
  if (!scenarioId) {
    return res.status(400).json({ error: 'scenarioId query param is required and must be valid' });
  }

  try {
    const record = await prisma.scenario.findUnique({
      where: { filePath: makeScenarioKey(scenarioId) },
      select: {
        filePath: true,
        sourceRef: true,
        owner: true,
        lifecycleStatus: true,
        lastRevisionAt: true,
        revisions: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 50,
          select: {
            id: true,
            source: true,
            sourceRef: true,
            changedBy: true,
            createdAt: true,
          },
        },
      },
    });

    if (!record) {
      return res.json({
        scenarioId,
        metadata: {
          owner: null,
          lifecycleStatus: 'active',
          lastRevisionAt: null,
        },
        revisions: [],
      });
    }

    const lifecycleStatus = parseLifecycleStatus(record.lifecycleStatus) ?? 'active';
    res.json({
      scenarioId,
      metadata: {
        owner: record.owner,
        lifecycleStatus,
        lastRevisionAt: record.lastRevisionAt?.toISOString() ?? null,
      },
      revisions: record.revisions.map((revision) => ({
        id: revision.id,
        source: revision.source,
        sourceRef: revision.sourceRef,
        changedBy: revision.changedBy,
        createdAt: revision.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/scenarios/metadata — set owner / lifecycle status without changing YAML source of truth
scenariosRouter.patch('/metadata', async (req, res) => {
  const auth = getRequestAuth(req);
  if (!auth || auth.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const body = req.body as {
    scenarioId?: unknown;
    scenarioRef?: unknown;
    owner?: unknown;
    lifecycleStatus?: unknown;
  };

  const scenarioId = parseScenarioId(body.scenarioId);
  if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required and must be valid' });

  const owner = parseOwner(body.owner);
  if (body.owner !== undefined && owner === undefined) {
    return res.status(400).json({ error: 'owner must be a string or null' });
  }

  let lifecycleStatus: ScenarioLifecycleStatus | undefined;
  if (body.lifecycleStatus !== undefined) {
    const parsedStatus = parseLifecycleStatus(body.lifecycleStatus);
    if (!parsedStatus) {
      return res.status(400).json({ error: 'lifecycleStatus must be draft, active, or deprecated' });
    }
    lifecycleStatus = parsedStatus;
  }
  if (owner === undefined && lifecycleStatus === undefined) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const scenarioRef = typeof body.scenarioRef === 'string' ? parseScenarioRef(body.scenarioRef) : null;
  if (!scenarioRef) {
    return res.status(400).json({ error: 'scenarioRef is required and must be a valid path#index value' });
  }

  const sourceDoc = readDocFromRef(scenarioRef.filePath, scenarioRef.fullPath, scenarioRef.docIndex);
  if (!sourceDoc) return res.status(404).json({ error: 'Scenario document not found' });

  const parsed = parseScenarioDocuments(sourceDoc.docText, { enforceSingleDoc: true, assignScenarioId: false });
  if (parsed.details.length > 0) {
    return res.status(400).json({ error: 'Scenario document failed validation', details: parsed.details });
  }

  const doc = parsed.docs[0]!;
  if (doc.scenarioId !== scenarioId) {
    return res.status(409).json({ error: 'scenarioId does not match the scenario_id in scenarioRef' });
  }

  try {
    await upsertScenarioState(
      doc,
      scenarioRef.scenarioRef,
      'sync',
      auth.username,
      {
        owner,
        lifecycleStatus,
      },
    );
    const updated = await prisma.scenario.findUnique({
      where: { filePath: makeScenarioKey(scenarioId) },
      select: {
        owner: true,
        lifecycleStatus: true,
        lastRevisionAt: true,
        _count: { select: { revisions: true } },
      },
    });
    const updatedStatus = parseLifecycleStatus(updated?.lifecycleStatus) ?? 'active';
    res.json({
      ok: true,
      scenarioId,
      metadata: {
        owner: updated?.owner ?? null,
        lifecycleStatus: updatedStatus,
        revisionCount: updated?._count.revisions ?? 0,
        lastRevisionAt: updated?.lastRevisionAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/scenarios/file — create a new YAML file (or append docs to an existing one)
scenariosRouter.post('/file', async (req, res) => {
  const { path: rawPath, content, append } = req.body as {
    path?: unknown;
    content?: unknown;
    append?: unknown;
  };

  if (typeof rawPath !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: 'path and content required' });
  }

  const resolvedPath = resolveScenarioFilePath(rawPath);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });

  const parsed = parseScenarioDocuments(content, { assignScenarioId: true });
  if (parsed.details.length > 0) {
    return res.status(400).json({ error: 'Invalid scenario YAML', details: parsed.details });
  }

  const changedBy = getRequestAuth(req)?.username ?? null;

  try {
    mkdirSync(dirname(resolvedPath.fullPath), { recursive: true });
    let existingDocs: string[] = [];
    let preamble = '';
    if (existsSync(resolvedPath.fullPath)) {
      if (append !== true) {
        return res.status(409).json({
          error: 'File already exists. Set append=true to add this scenario to it, or choose a different filename.',
        });
      }
      const existingRaw = readFileSync(resolvedPath.fullPath, 'utf-8');
      const split = splitMultiDoc(existingRaw);
      preamble = split.preamble;
      existingDocs = split.docs;
    }

    const startingIndex = existingDocs.length;
    const docsToAppend = parsed.docs.map((doc) => doc.yamlContent);
    const joined = joinMultiDoc(preamble, [...existingDocs, ...docsToAppend]);
    writeFileSync(resolvedPath.fullPath, joined, 'utf-8');

    await Promise.all(parsed.docs.map((doc, index) => upsertScenarioState(
      doc,
      `${resolvedPath.filePath}#${startingIndex + index}`,
      'create',
      changedBy,
    )));

    res.json({
      ok: true,
      path: resolvedPath.filePath,
      scenarioIds: parsed.docs.map((doc) => doc.scenarioId),
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/scenarios/update-doc — replace one YAML document in a multi-doc file
// Body: { filePath: 'banking/account_query.yaml', docIndex: 2, docContent: '<yaml string>' }
scenariosRouter.post('/update-doc', async (req, res) => {
  const { filePath: rawFilePath, docIndex, docContent } = req.body as {
    filePath?: unknown;
    docIndex?: unknown;
    docContent?: unknown;
  };

  if (typeof rawFilePath !== 'string' || typeof docContent !== 'string' || !Number.isInteger(docIndex)) {
    return res.status(400).json({ error: 'filePath, docIndex and docContent required' });
  }
  const targetDocIndex = Number(docIndex);

  const resolvedPath = resolveScenarioFilePath(rawFilePath);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });
  if (!existsSync(resolvedPath.fullPath)) return res.status(404).json({ error: 'File not found' });

  const parsed = parseScenarioDocuments(docContent, { enforceSingleDoc: true, assignScenarioId: true });
  if (parsed.details.length > 0) {
    return res.status(400).json({ error: 'Invalid scenario YAML', details: parsed.details });
  }

  const changedBy = getRequestAuth(req)?.username ?? null;

  try {
    const source = readDocFromRef(resolvedPath.filePath, resolvedPath.fullPath, targetDocIndex);
    if (!source) {
      const docCount = splitMultiDoc(readFileSync(resolvedPath.fullPath, 'utf-8')).docs.length;
      return res.status(400).json({ error: `docIndex ${targetDocIndex} out of range (file has ${docCount} docs)` });
    }

    source.docs[targetDocIndex] = parsed.docs[0]!.yamlContent;
    writeFileSync(resolvedPath.fullPath, joinMultiDoc(source.preamble, source.docs), 'utf-8');

    await upsertScenarioState(
      parsed.docs[0]!,
      `${resolvedPath.filePath}#${targetDocIndex}`,
      'edit',
      changedBy,
    );
    res.json({
      ok: true,
      filePath: resolvedPath.filePath,
      docIndex: targetDocIndex,
      scenarioId: parsed.docs[0]!.scenarioId,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
