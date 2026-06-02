// src/api/routes/runs.ts
// Validates run requests, enqueues jobs, and serves run state + SSE log replay.
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

import { prisma } from '../../db/client.js';
import { loadScenariosFromFile } from '../../conversation/scenario-loader.js';
import { hasRunEvents, listRunEvents, publishRunEvent } from '../../jobs/run-events.js';
import { createQueuedRun } from '../../jobs/run-jobs.js';
import type { RunProvider } from '../../jobs/run-job-payload.js';
import { appendRunLogLine, readRunLogLines } from '../../jobs/run-logs.js';
import type { Scenario } from '../../types/scenario.js';
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

// GET /api/runs
runsRouter.get('/', async (_req, res) => {
  try {
    const runs = await prisma.run.findMany({
      where: { NOT: { status: 'deleted' } },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { evalResult: true },
    });
    res.json({ runs });
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
    res.json({ run });
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
    res.json({ logs: readRunLogLines(run.id) });
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
      sendEvent(event.eventType, event.payload, event.id);
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
            reportJsonPath: run.report?.jsonPath ?? null,
            reportHtmlPath: run.report?.htmlPath ?? null,
          });
        } else if (run.status === 'failed') {
          sendEvent('failed', { error: run.errorMessage ?? 'Run failed' });
        }
      }
      res.end();
      return;
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
    sendEvent('log', { message: logLines[i] }, i);
  }

  if (run && run.status !== 'running' && run.status !== 'pending') {
    if (run.status === 'completed') {
      sendEvent('complete', {
        runId,
        overallScore: run.evalResult?.overallScore ?? null,
        passed: run.evalResult?.passed ?? null,
        summary: run.evalResult?.summary ?? 'Run completed',
        reportJsonPath: run.report?.jsonPath ?? null,
        reportHtmlPath: run.report?.htmlPath ?? null,
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

async function publishRunEventSafe(
  runId: string,
  eventType: 'queued' | 'start' | 'log' | 'complete' | 'failed',
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await publishRunEvent(runId, eventType, payload);
  } catch (err) {
    console.error(`Failed to persist ${eventType} event for run ${runId}: ${(err as Error).message}`);
  }
}
