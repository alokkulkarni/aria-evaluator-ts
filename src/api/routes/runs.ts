// src/api/routes/runs.ts
// Validates run requests, enqueues jobs, and serves run state + SSE log replay.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

import { prisma } from '../../db/client.js';
import { loadScenariosFromFile } from '../../conversation/scenario-loader.js';
import { hasRunEvents, listRunEvents, publishRunEventSafe } from '../../jobs/run-events.js';
import { createQueuedRun } from '../../jobs/run-jobs.js';
import type { RunProvider } from '../../jobs/run-job-payload.js';
import { appendRunLogLine, readRunLogLines } from '../../jobs/run-logs.js';
import { normalizeArtifactRef, sanitizeArtifactPathInLogLine } from '../../runtime/paths.js';
import type { Scenario } from '../../types/scenario.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { registerSseClient, unregisterSseClient } from '../sse-bus.js';
import { getEffectiveSettings } from '../runtime-settings.js';

export const runsRouter = Router();

const SCENARIOS_DIR = resolve(
  process.env['SCENARIOS_DIR'] ?? join('..', 'aria-evaluator-v2', 'scenarios'),
);

interface RunRequestBody {
  scenarioFile?: string;
  scenarioIndex?: number;
  scenarioFiles?: string[];
  scenarioRefs?: string[];
  channel?: 'chat' | 'voice';
  provider?: RunProvider;
}

function sanitizeRelativePath(input: string): string | null {
  if (!input || input.includes('..') || input.startsWith('/')) return null;
  return input.replace(/\\/g, '/');
}

function sanitizeScenarioRef(input: string): string | null {
  if (!input) return null;
  const [rawPath, rawIndex] = input.split('#');
  if (!rawPath || rawIndex == null) return null;

  const filePath = sanitizeRelativePath(rawPath);
  if (!filePath) return null;

  const index = Number.parseInt(rawIndex, 10);
  if (!Number.isFinite(index) || index < 0) return null;

  return `${filePath}#${index}`;
}

function makeRunLabel(scenarios: Scenario[], files: string[]): string {
  if (scenarios.length === 1) return scenarios[0]!.name;
  if (files.length === 1) return `${scenarios.length} scenarios (${files[0]})`;
  return `${scenarios.length} scenarios (${files.length} files)`;
}

function normalizeProvider(raw?: string): RunProvider {
  const candidate = (raw ?? '').toLowerCase();
  if (
    candidate === 'connect' ||
    candidate === 'lex' ||
    candidate === 'azure' ||
    candidate === 'strands' ||
    candidate === 'copilot' ||
    candidate === 'custom' ||
    candidate === 'openapi' ||
    candidate === 'websocket'
  ) {
    return candidate;
  }
  return 'connect';
}

function normalizeReportRef(rawPath: string | null | undefined): string | null {
  if (!rawPath) return null;
  return normalizeArtifactRef('reports', rawPath);
}

function sanitizeEventPayload(
  eventType: 'queued' | 'start' | 'log' | 'complete' | 'failed',
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (eventType === 'log') {
    const message = typeof payload['message'] === 'string'
      ? sanitizeArtifactPathInLogLine(payload['message'])
      : payload['message'];
    return { ...payload, message };
  }

  if (eventType === 'complete') {
    const reportJsonPath = typeof payload['reportJsonPath'] === 'string'
      ? normalizeReportRef(payload['reportJsonPath'])
      : null;
    const reportHtmlPath = typeof payload['reportHtmlPath'] === 'string'
      ? normalizeReportRef(payload['reportHtmlPath'])
      : null;
    return { ...payload, reportJsonPath, reportHtmlPath };
  }

  return payload;
}

const VALID_RUN_STATUSES = new Set(['pending', 'running', 'completed', 'failed']);
const CUID_RE = /^c[a-z0-9]{20,30}$/;
const PROVIDER_RE = /^[a-zA-Z0-9_-]{1,50}$/;

function parseSingleQueryString(raw: unknown): string | undefined {
  if (Array.isArray(raw)) return undefined;
  if (typeof raw === 'string') return raw;
  return undefined;
}

// GET /api/runs — supports optional filter params: status, channel, provider, since, until, scenarioId, limit, offset
runsRouter.get('/', async (req, res) => {
  const status = parseSingleQueryString(req.query['status']);
  if (status !== undefined && !VALID_RUN_STATUSES.has(status)) {
    return res.status(400).json({ error: 'status must be one of: pending, running, completed, failed' });
  }

  const channel = parseSingleQueryString(req.query['channel']);
  if (channel !== undefined && channel !== 'chat' && channel !== 'voice') {
    return res.status(400).json({ error: 'channel must be chat or voice' });
  }

  const provider = parseSingleQueryString(req.query['provider']);
  if (provider !== undefined && !PROVIDER_RE.test(provider)) {
    return res.status(400).json({ error: 'provider must be alphanumeric, underscores, or hyphens, max 50 chars' });
  }

  const sinceRaw = parseSingleQueryString(req.query['since']);
  const untilRaw = parseSingleQueryString(req.query['until']);
  let sinceDate: Date | undefined;
  let untilDate: Date | undefined;
  if (sinceRaw !== undefined) {
    sinceDate = new Date(sinceRaw);
    if (!Number.isFinite(sinceDate.getTime())) {
      return res.status(400).json({ error: 'since must be a valid ISO date' });
    }
  }
  if (untilRaw !== undefined) {
    untilDate = new Date(untilRaw);
    if (!Number.isFinite(untilDate.getTime())) {
      return res.status(400).json({ error: 'until must be a valid ISO date' });
    }
  }
  if (sinceDate !== undefined && untilDate !== undefined && sinceDate > untilDate) {
    return res.status(400).json({ error: 'since must not be after until' });
  }

  const scenarioId = parseSingleQueryString(req.query['scenarioId']);
  if (scenarioId !== undefined && !CUID_RE.test(scenarioId)) {
    return res.status(400).json({ error: 'invalid scenarioId format' });
  }

  const limitRaw = parseSingleQueryString(req.query['limit']);
  let limit = 100;
  if (limitRaw !== undefined) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 500) {
      return res.status(400).json({ error: 'limit must be an integer between 1 and 500' });
    }
    limit = parsed;
  }

  const offsetRaw = parseSingleQueryString(req.query['offset']);
  let offset = 0;
  if (offsetRaw !== undefined) {
    const parsed = Number.parseInt(offsetRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return res.status(400).json({ error: 'offset must be a non-negative integer' });
    }
    offset = parsed;
  }

  try {
    const where = {
      NOT: { status: 'deleted' },
      ...(status !== undefined ? { status } : {}),
      ...(channel !== undefined ? { channel } : {}),
      ...(sinceDate !== undefined || untilDate !== undefined
        ? {
            createdAt: {
              ...(sinceDate !== undefined ? { gte: sinceDate } : {}),
              ...(untilDate !== undefined ? { lte: untilDate } : {}),
            },
          }
        : {}),
      ...(scenarioId !== undefined ? { scenarioId } : {}),
      ...(provider !== undefined ? { telemetry: { is: { provider } } } : {}),
    };

    const [runs, total] = await Promise.all([
      prisma.run.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          evalResult: true,
          telemetry: { select: { provider: true, latencyMs: true, failureClass: true } },
        },
      }),
      prisma.run.count({ where }),
    ]);
    res.json({ runs, total, limit, offset });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/compare — MUST be before /:id to avoid route shadowing
// Query param: ids (comma-separated, 2–10 run IDs; no duplicates)
runsRouter.get('/compare', async (req, res) => {
  const idsRaw = parseSingleQueryString(req.query['ids']) ?? '';
  const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean);

  if (ids.length < 2) {
    return res.status(400).json({ error: 'At least 2 run IDs are required' });
  }
  if (ids.length > 10) {
    return res.status(400).json({ error: 'At most 10 run IDs allowed' });
  }

  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length > 0) {
    const uniqueDuplicates = Array.from(new Set(duplicateIds));
    return res.status(400).json({
      error: `Duplicate run IDs are not allowed: ${uniqueDuplicates.join(', ')}`,
    });
  }

  if (!ids.every((id) => CUID_RE.test(id))) {
    return res.status(400).json({ error: 'One or more run IDs have an invalid format' });
  }

  try {
    const runs = await prisma.run.findMany({
      where: { id: { in: ids }, NOT: { status: 'deleted' } },
      include: {
        turns: { orderBy: { index: 'asc' } },
        evalResult: true,
        telemetry: true,
      },
    });

    if (runs.length !== ids.length) {
      const foundIds = new Set(runs.map((r) => r.id));
      const missing = ids.filter((id) => !foundIds.has(id));
      return res.status(404).json({ error: `Runs not found: ${missing.join(', ')}` });
    }

    const runsWithParsed = runs.map((run) => {
      let dimensionScores: Record<string, unknown> = {};
      let dimensionScoresParseError = false;
      if (run.evalResult?.dimensionScores) {
        try {
          dimensionScores = JSON.parse(run.evalResult.dimensionScores) as Record<string, unknown>;
        } catch {
          dimensionScoresParseError = true;
        }
      }
      return {
        ...run,
        evalResult: run.evalResult
          ? { ...run.evalResult, dimensionScores, dimensionScoresParseError }
          : null,
      };
    });

    // Preserve the caller's requested ordering
    const ordered = ids.map((id) => runsWithParsed.find((r) => r.id === id)!);
    res.json({ runs: ordered });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/failures/summary — MUST be before /:id to avoid route shadowing
// Query param: hours (1–168, default 48)
runsRouter.get('/failures/summary', async (req, res) => {
  const rawHours = req.query['hours'];
  let hours = 48;
  if (rawHours !== undefined) {
    if (Array.isArray(rawHours)) {
      return res.status(400).json({ error: 'hours must be a single value' });
    }
    if (typeof rawHours !== 'string' || rawHours.trim() === '') {
      return res.status(400).json({ error: 'hours must be an integer between 1 and 168' });
    }
    const parsed = Number.parseInt(rawHours, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168) {
      return res.status(400).json({ error: 'hours must be an integer between 1 and 168' });
    }
    hours = parsed;
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    // Query RunTelemetry directly (consistent with observability); runs without telemetry are excluded.
    const failures = await prisma.runTelemetry.findMany({
      where: {
        status: 'failed',
        createdAt: { gte: since },
        run: { NOT: { status: 'deleted' } },
      },
      select: {
        run: { select: { scenarioName: true } },
        failureClass: true,
      },
    });

    const clusterMap = new Map<string, { scenarioName: string; failureClass: string; count: number }>();
    for (const row of failures) {
      const scenarioName = row.run.scenarioName;
      const failureClass = row.failureClass ?? 'unknown';
      const key = `${scenarioName}::${failureClass}`;
      const existing = clusterMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        clusterMap.set(key, { scenarioName, failureClass, count: 1 });
      }
    }

    const clusters = Array.from(clusterMap.values()).sort((a, b) => b.count - a.count);
    res.json({ window: { hours, since: since.toISOString() }, totalFailures: failures.length, clusters });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/:id
runsRouter.get('/:id', async (req, res) => {
  try {
    const run = await prisma.run.findFirst({
      where: { id: req.params['id']!, NOT: { status: 'deleted' } },
      include: { turns: { orderBy: { index: 'asc' } }, evalResult: true, report: true },
    });
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json({
      run: {
        ...run,
        report: run.report
          ? {
              ...run.report,
              jsonPath: normalizeReportRef(run.report.jsonPath),
              htmlPath: normalizeReportRef(run.report.htmlPath),
            }
          : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/:id/logs
runsRouter.get('/:id/logs', async (req, res) => {
  try {
    const run = await prisma.run.findFirst({
      where: { id: req.params['id']!, NOT: { status: 'deleted' } },
      select: { id: true },
    });
    if (!run) return res.status(404).json({ error: 'Not found' });
    res.json({ logs: readRunLogLines(run.id).map(sanitizeArtifactPathInLogLine) });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/runs/:id — soft delete
runsRouter.delete('/:id', async (req, res) => {
  try {
    const runId = req.params['id']!;
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updatedRun = await tx.run.updateMany({
        where: { id: runId },
        data: { status: 'deleted' },
      });
      if (updatedRun.count === 0) return { updatedRunCount: 0, queuedJobCount: 0 };

      const updatedJob = await tx.job.updateMany({
        where: { runId, status: 'queued' },
        data: {
          status: 'failed',
          completedAt: now,
          errorMessage: 'Run deleted before execution',
        },
      });

      return { updatedRunCount: updatedRun.count, queuedJobCount: updatedJob.count };
    });

    if (result.updatedRunCount === 0) return res.status(404).json({ error: 'Not found' });
    if (result.queuedJobCount > 0) {
      const message = '=== Run deleted before execution. Removing queued job. ===';
      appendRunLogLine(runId, message);
      await publishRunEventSafe(runId, 'failed', {
        runId,
        error: 'Run deleted before execution',
        message,
      });
    }
    await recordAuditEventSafe(req, 'runs.delete', runId, {
      queuedJobsFailed: result.queuedJobCount,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/runs/:id/events — SSE
runsRouter.get('/:id/events', async (req, res) => {
  const runId = req.params['id']!;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown, id?: number): void => {
    if (id !== undefined) res.write(`id: ${id}\n`);
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const lastIdHeader = req.headers['last-event-id'];
  const lastIdStr = Array.isArray(lastIdHeader) ? lastIdHeader[0] : lastIdHeader;
  const parsedLastId = lastIdStr ? Number.parseInt(lastIdStr, 10) : Number.NaN;
  const startFrom = Number.isNaN(parsedLastId) ? 0 : parsedLastId + 1;

  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { evalResult: true, report: true },
  });
  const replayStructuredEvents = await hasRunEvents(runId);
  if (replayStructuredEvents) {
    const events = await listRunEvents(runId, startFrom);
    for (const event of events) {
      sendEvent(event.eventType, sanitizeEventPayload(event.eventType, event.payload), event.id);
    }
    let hasTerminalEvent = events.some(
      (event) => event.eventType === 'complete' || event.eventType === 'failed',
    );

    // If the client reconnected after the terminal event, `events` may be empty even though
    // the terminal event was already delivered earlier. Avoid emitting a duplicate fallback.
    if (!hasTerminalEvent && !Number.isNaN(parsedLastId)) {
      const terminalEvent = await prisma.runEvent.findFirst({
        where: { runId, eventType: { in: ['complete', 'failed'] } },
        orderBy: { id: 'desc' },
        select: { id: true },
      });
      if (terminalEvent && parsedLastId >= terminalEvent.id) hasTerminalEvent = true;
    }

    if (run && run.status !== 'running' && run.status !== 'pending') {
      if (!hasTerminalEvent) {
        if (run.status === 'completed') {
          sendEvent('complete', {
            runId,
            overallScore: run.evalResult?.overallScore ?? null,
            passed: run.evalResult?.passed ?? null,
            summary: run.evalResult?.summary ?? 'Run completed',
            reportJsonPath: normalizeReportRef(run.report?.jsonPath),
            reportHtmlPath: normalizeReportRef(run.report?.htmlPath),
          });
        } else if (run.status === 'failed') {
          sendEvent('failed', { error: run.errorMessage ?? 'Run failed' });
        }
      }
      res.end();
      return;
    }

    registerSseClient(runId, res);
    req.on('close', () => {
      unregisterSseClient(runId, res);
    });
    return;
  }

  const logLines = readRunLogLines(runId);
  for (let i = startFrom; i < logLines.length; i++) {
    sendEvent('log', { message: sanitizeArtifactPathInLogLine(logLines[i]!) }, i);
  }

  if (run && run.status !== 'running' && run.status !== 'pending') {
    if (run.status === 'completed') {
      sendEvent('complete', {
        runId,
        overallScore: run.evalResult?.overallScore ?? null,
        passed: run.evalResult?.passed ?? null,
        summary: run.evalResult?.summary ?? 'Run completed',
        reportJsonPath: normalizeReportRef(run.report?.jsonPath),
        reportHtmlPath: normalizeReportRef(run.report?.htmlPath),
      });
    } else if (run.status === 'failed') {
      sendEvent('failed', { error: run.errorMessage ?? 'Run failed' });
    }
    res.end();
    return;
  }

  registerSseClient(runId, res);
  req.on('close', () => {
    unregisterSseClient(runId, res);
  });
});

// POST /api/runs
runsRouter.post('/', async (req, res) => {
  const {
    scenarioFile,
    scenarioIndex,
    scenarioFiles = [],
    scenarioRefs = [],
    channel = 'chat',
    provider: requestedProvider,
  } = req.body as RunRequestBody;
  const settings = getEffectiveSettings();
  const provider = normalizeProvider(requestedProvider ?? settings['EVAL_PROVIDER_DEFAULT'] ?? 'connect');

  const normalizedRefs = (scenarioRefs ?? [])
    .map((ref) => sanitizeScenarioRef(ref))
    .filter((ref): ref is string => !!ref);

  const normalizedFiles = (scenarioFiles ?? [])
    .map((file) => sanitizeRelativePath(file))
    .filter((file): file is string => !!file);

  const selectedScenarios: Scenario[] = [];
  let selectedFiles: string[] = [];

  if (normalizedRefs.length > 0) {
    const uniqueRefs = [...new Set(normalizedRefs)];
    selectedFiles = [...new Set(uniqueRefs.map((ref) => ref.split('#')[0]!))];
    const docsByFile = new Map<string, Scenario[]>();

    for (const relativeFile of selectedFiles) {
      const fullPath = join(SCENARIOS_DIR, relativeFile);
      if (!fullPath.startsWith(SCENARIOS_DIR) || !existsSync(fullPath)) {
        return res.status(404).json({ error: `Scenario file not found: ${relativeFile}` });
      }
      docsByFile.set(relativeFile, loadScenariosFromFile(fullPath, SCENARIOS_DIR));
    }

    for (const ref of uniqueRefs) {
      const [relativeFile, rawIndex] = ref.split('#');
      const index = Number.parseInt(rawIndex ?? '', 10);
      const docs = docsByFile.get(relativeFile ?? '');
      const picked = docs?.[index];
      if (!picked) return res.status(400).json({ error: `Scenario ref out of range: ${ref}` });
      selectedScenarios.push(picked);
    }
  } else {
    selectedFiles = normalizedFiles.length > 0
      ? [...new Set(normalizedFiles)]
      : (() => {
          const single = sanitizeRelativePath(scenarioFile ?? '');
          return single ? [single] : [];
        })();

    if (selectedFiles.length === 0) {
      return res.status(400).json({ error: 'scenarioFile, scenarioFiles[] or scenarioRefs[] is required' });
    }

    for (const relativeFile of selectedFiles) {
      const fullPath = join(SCENARIOS_DIR, relativeFile);
      if (!fullPath.startsWith(SCENARIOS_DIR) || !existsSync(fullPath)) {
        return res.status(404).json({ error: `Scenario file not found: ${relativeFile}` });
      }

      const docs = loadScenariosFromFile(fullPath, SCENARIOS_DIR);
      if (docs.length === 0) continue;

      if (selectedFiles.length === 1 && scenarioIndex != null) {
        const picked = docs[scenarioIndex];
        if (!picked) return res.status(400).json({ error: 'Scenario index out of range' });
        selectedScenarios.push(picked);
        continue;
      }

      selectedScenarios.push(...docs);
    }
  }

  if (selectedScenarios.length === 0) {
    return res.status(400).json({ error: 'No scenarios found in selected file(s)' });
  }

  const runId = randomUUID();
  const runLabel = makeRunLabel(selectedScenarios, selectedFiles);
  const yamlContent = selectedScenarios
    .map((scenario) => {
      const { filePath: _filePath, ...doc } = scenario;
      return yaml.dump(doc, { lineWidth: -1 }).trim();
    })
    .join('\n---\n');

  try {
    await createQueuedRun({
      runId,
      scenarioName: `[${provider}] ${runLabel}`,
      channel,
      payload: {
        provider,
        channel,
        scenarioFiles: selectedFiles,
        scenarioCount: selectedScenarios.length,
        yamlContent,
      },
    });
    res.status(202).json({ runId, scenarioName: runLabel });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
