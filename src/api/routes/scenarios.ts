import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { Router } from 'express';
import yaml from 'js-yaml';

import { getRequestAuth } from '../auth.js';
import { checkScenarioQuota } from '../../shared/quota-enforcement.js';
import { getUsageLimits } from '../../shared/usage-limits.js';
import {
  deterministicScenarioId,
  normalizeScenarioDoc,
  parseOwner,
  parseScenarioDocuments,
  parseLifecycleStatus,
  parseScenarioId,
  type ScenarioLifecycleStatus,
} from '../../conversation/scenario-doc.js';
import {
  countOwnScenarioDocsForFile,
  getScenarioFileContentFromDb,
  getScenarioRevisions,
  listScenarioFilesFromDb,
  listScenariosFromDb,
  shouldWriteScenarioFiles,
  updateScenarioMetadata,
  upsertScenarioState,
} from '../../conversation/scenario-store.js';

export const scenariosRouter = Router();

// Bundled scenarios live here and seed the GLOBAL library at startup (server.ts).
// At request time scenarios are served from the DB (Postgres), not these files.
const SCENARIOS_DIR = resolve(
  process.env['SCENARIOS_DIR'] ?? join('..', 'aria-evaluator-v2', 'scenarios'),
);

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

// GET /api/scenarios — list scenarios visible to the caller (DB-authoritative)
scenariosRouter.get('/', async (_req, res) => {
  try {
    const scenarios = await listScenariosFromDb();
    res.json({ scenarios, total: scenarios.length, dir: SCENARIOS_DIR });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/files — list YAML file paths visible to the caller
scenariosRouter.get('/files', async (_req, res) => {
  try {
    const files = await listScenarioFilesFromDb();
    res.json({ files, dir: SCENARIOS_DIR });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/file?path=banking/account_query.yaml — raw YAML (DB-first)
scenariosRouter.get('/file', async (req, res) => {
  const pathInput = req.query['path'];
  if (typeof pathInput !== 'string' || !pathInput.trim()) {
    return res.status(400).json({ error: 'path query param required' });
  }

  const resolvedPath = resolveScenarioFilePath(pathInput);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });

  try {
    const dbContent = await getScenarioFileContentFromDb(resolvedPath.filePath);
    if (dbContent != null) {
      return res.json({ path: resolvedPath.filePath, content: dbContent });
    }
    // Admin authoring fallback: a file on disk not yet imported into the DB.
    if (shouldWriteScenarioFiles() && existsSync(resolvedPath.fullPath)) {
      return res.json({ path: resolvedPath.filePath, content: readFileSync(resolvedPath.fullPath, 'utf-8') });
    }
    return res.status(404).json({ error: 'Scenario not found' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/scenarios/folders — top-level directory names for the location picker
scenariosRouter.get('/folders', async (_req, res) => {
  try {
    const files = await listScenarioFilesFromDb();
    const folders = [...new Set(
      files.filter((file) => file.includes('/')).map((file) => file.split('/')[0]!),
    )].sort();
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
    const data = await getScenarioRevisions(scenarioId);
    if (!data) {
      return res.json({
        scenarioId,
        metadata: { owner: null, lifecycleStatus: 'active', lastRevisionAt: null },
        revisions: [],
      });
    }
    res.json({ scenarioId, metadata: data.metadata, revisions: data.revisions });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/scenarios/metadata — set owner / lifecycle status on the caller's scenario row
scenariosRouter.patch('/metadata', async (req, res) => {
  const auth = getRequestAuth(req);
  if (!auth || auth.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const body = req.body as { scenarioId?: unknown; owner?: unknown; lifecycleStatus?: unknown };

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

  try {
    const metadata = await updateScenarioMetadata(scenarioId, { owner, lifecycleStatus });
    if (!metadata) {
      return res.status(404).json({ error: 'Scenario not found — create or edit it first' });
    }
    res.json({
      ok: true,
      scenarioId,
      metadata: {
        owner: metadata.owner,
        lifecycleStatus: metadata.lifecycleStatus,
        revisionCount: metadata.revisionCount,
        lastRevisionAt: metadata.lastRevisionAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/scenarios/file — create a scenario (or append docs). DB-authoritative;
// the YAML file is written only in the admin/system context (never for tenants).
scenariosRouter.post('/file', async (req, res) => {
  const { path: rawPath, content, append } = req.body as {
    path?: unknown;
    content?: unknown;
    append?: unknown;
  };

  if (typeof rawPath !== 'string' || typeof content !== 'string') {
    return res.status(400).json({ error: 'path and content required' });
  }

  if (append !== true) {
    const quota = await checkScenarioQuota();
    if (!quota.allowed) {
      return res.status(402).json({
        error: quota.error,
        code: quota.code,
        limit: quota.limit,
        current: quota.current,
        maximum: quota.maximum,
        upgradeUrl: getUsageLimits().upgradeUrl,
      });
    }
  }

  const resolvedPath = resolveScenarioFilePath(rawPath);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });

  const parsed = parseScenarioDocuments(content, { assignScenarioId: true });
  if (parsed.details.length > 0) {
    return res.status(400).json({ error: 'Invalid scenario YAML', details: parsed.details });
  }

  const changedBy = getRequestAuth(req)?.username ?? null;
  const writeFiles = shouldWriteScenarioFiles();

  try {
    let existingDocs: string[] = [];
    let preamble = '';
    let fileExists = false;
    if (writeFiles && existsSync(resolvedPath.fullPath)) {
      fileExists = true;
      const split = splitMultiDoc(readFileSync(resolvedPath.fullPath, 'utf-8'));
      preamble = split.preamble;
      existingDocs = split.docs;
    }

    const dbCount = await countOwnScenarioDocsForFile(resolvedPath.filePath);
    if ((fileExists || dbCount > 0) && append !== true) {
      return res.status(409).json({
        error: 'Scenario file already exists. Set append=true to add this scenario to it, or choose a different filename.',
      });
    }

    const startingIndex = fileExists ? existingDocs.length : dbCount;

    if (writeFiles) {
      mkdirSync(dirname(resolvedPath.fullPath), { recursive: true });
      const docsToAppend = parsed.docs.map((doc) => doc.yamlContent);
      writeFileSync(resolvedPath.fullPath, joinMultiDoc(preamble, [...existingDocs, ...docsToAppend]), 'utf-8');
    }

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

// POST /api/scenarios/update-doc — replace one scenario document
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
  if (targetDocIndex < 0) return res.status(400).json({ error: 'docIndex must be >= 0' });

  const resolvedPath = resolveScenarioFilePath(rawFilePath);
  if (!resolvedPath) return res.status(400).json({ error: 'Invalid path' });

  const sourceRef = `${resolvedPath.filePath}#${targetDocIndex}`;

  let parsedYaml: unknown;
  try {
    parsedYaml = yaml.load(docContent); // throws on multi-doc input (single doc required)
  } catch (err) {
    return res.status(400).json({ error: `Invalid scenario YAML: ${(err as Error).message}` });
  }
  if (!parsedYaml || typeof parsedYaml !== 'object' || Array.isArray(parsedYaml)) {
    return res.status(400).json({ error: 'Scenario document must be a single YAML object' });
  }

  const docObject = parsedYaml as Record<string, unknown>;
  if (typeof docObject['scenario_id'] !== 'string' || !(docObject['scenario_id'] as string).trim()) {
    docObject['scenario_id'] = deterministicScenarioId(sourceRef);
  }

  const normalized = normalizeScenarioDoc(docObject, 1, false);
  if (!normalized.doc) {
    return res.status(400).json({ error: 'Invalid scenario YAML', details: normalized.details });
  }

  const changedBy = getRequestAuth(req)?.username ?? null;

  try {
    if (shouldWriteScenarioFiles()) {
      // Single read instead of existsSync()-then-write, so there is no
      // time-of-check/time-of-use race (CodeQL js/file-system-race). A missing
      // file is not an error here: the DB upsert below is authoritative.
      let rawFile: string | null;
      try {
        rawFile = readFileSync(resolvedPath.fullPath, 'utf-8');
      } catch (readErr) {
        if ((readErr as NodeJS.ErrnoException).code === 'ENOENT') rawFile = null;
        else throw readErr;
      }
      if (rawFile !== null) {
        const { preamble, docs } = splitMultiDoc(rawFile);
        if (targetDocIndex >= docs.length) {
          return res.status(400).json({ error: `docIndex ${targetDocIndex} out of range (file has ${docs.length} docs)` });
        }
        docs[targetDocIndex] = normalized.doc.yamlContent;
        writeFileSync(resolvedPath.fullPath, joinMultiDoc(preamble, docs), 'utf-8');
      }
    }

    await upsertScenarioState(normalized.doc, sourceRef, 'edit', changedBy);
    res.json({
      ok: true,
      filePath: resolvedPath.filePath,
      docIndex: targetDocIndex,
      scenarioId: normalized.doc.scenarioId,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
