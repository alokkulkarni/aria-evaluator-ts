import type { Prisma } from '@prisma/client';
import { spawn } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

import { prisma } from '../db/client.js';
import { getRuntimeSettingsEnv } from '../api/runtime-settings.js';
import {
  appPaths,
  normalizeArtifactRef,
  resolveLoggedArtifactPath,
  sanitizeArtifactPathInLogLine,
} from '../runtime/paths.js';
import type { Transcript } from '../types/transcript.js';
import type { EvalResult, DimensionScore } from '../types/evaluation.js';
import { parseRunJobPayload } from './run-job-payload.js';
import {
  clearRunEventQueue,
  publishRunEvent,
  publishRunEventSafe,
  waitForRunEventQueue,
} from './run-events.js';
import { appendRunLogLine, resetRunLog } from './run-logs.js';
import {
  TOKEN_ESTIMATOR_VERSION,
  classifyFailure,
  estimateTokensFromTurns,
} from '../lib/observability.js';

type ClaimedRunJob = Prisma.JobGetPayload<{ include: { run: true } }>;

interface AggregatedReportJson {
  runId: string;
  generatedAt: string;
  transcripts: Transcript[];
  results: EvalResult[];
}

const PROJECT_ROOT = appPaths.projectRoot;
const TMP_RUN_DIR = appPaths.portalRunsDir;
const TRANSCRIPTS_DIR = appPaths.transcriptsDir;
const REPORTS_DIR = appPaths.reportsDir;
const parsedHardTimeoutMs = Number.parseInt(process.env['RUN_HARD_TIMEOUT_MS'] ?? '3600000', 10);
const RUN_HARD_TIMEOUT_MS = Number.isNaN(parsedHardTimeoutMs) ? 3_600_000 : parsedHardTimeoutMs;
const parsedDoneGraceMs = Number.parseInt(process.env['RUN_DONE_GRACE_MS'] ?? '12000', 10);
const RUN_DONE_GRACE_MS = Number.isNaN(parsedDoneGraceMs) ? 12_000 : parsedDoneGraceMs;

export async function executeRunJob(job: ClaimedRunJob): Promise<void> {
  const payload = parseRunJobPayload(job.payloadJson);
  const runId = job.runId;
  const startedAt = job.startedAt ?? new Date();
  const startedAtMs = startedAt.getTime();
  const tmpScenarioPath = join(TMP_RUN_DIR, `run-${runId}.yaml`);
  const transcriptPaths = new Set<string>();
  let reportJsonPath: string | null = null;
  let reportHtmlPath: string | null = null;
  let reportJsonRef: string | null = null;
  let reportHtmlRef: string | null = null;
  let stderrTail = '';
  let finalStatus: 'completed' | 'failed' = 'completed';
  let finalError: string | null = null;

  const flushBufferedLines = (
    chunk: Buffer,
    carry: { value: string },
    onLine: (line: string) => void,
  ): void => {
    carry.value += chunk.toString('utf-8');
    const lines = carry.value.split(/\r?\n/);
    carry.value = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  };

  const publishLogEvent = (message: string): void => {
    const sanitizedMessage = sanitizeArtifactPathInLogLine(message);
    appendRunLogLine(runId, sanitizedMessage);
    void publishRunEvent(runId, 'log', { message: sanitizedMessage }).catch((err) => {
      console.error(`Failed to persist log event for run ${runId}: ${(err as Error).message}`);
    });
  };

  clearRunEventQueue(runId);
  await clearPreviousRunState(runId);
  writeFileSync(tmpScenarioPath, `${payload.yamlContent.trimEnd()}\n`, 'utf-8');
  const startMessage =
    `▶ Run started [provider=${payload.provider} channel=${payload.channel} scenarios=${payload.scenarioCount}]`;
  resetRunLog(
    runId,
    `=== Run ${runId} started at ${startedAt.toISOString()} [provider=${payload.provider} channel=${payload.channel}] ===`,
  );
  await publishRunEventSafe(runId, 'start', {
    runId,
    provider: payload.provider,
    channel: payload.channel,
    scenarioFiles: payload.scenarioFiles,
    scenarioCount: payload.scenarioCount,
    startedAt: startedAt.toISOString(),
    message: startMessage,
  });

  try {
    const args = [
      'run',
      `cli:${payload.provider}`,
      '--',
      '--scenario',
      basename(tmpScenarioPath),
      '--scenarios-dir',
      TMP_RUN_DIR,
      '--channel',
      payload.channel,
    ];

    // detached=true makes npm the leader of a new process group so we can
    // kill the entire group (npm + spawned children) in one shot.
    const child = spawn('npm', args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, ...getRuntimeSettingsEnv() },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });

    const stopChild = (signal: NodeJS.Signals): void => {
      try {
        if (child.pid != null) process.kill(-child.pid, signal);
      } catch {
        if (child.exitCode == null && !child.killed) child.kill(signal);
      }
    };

    let forceResolveExit: ((value: { code: number | null; signal: NodeJS.Signals | null }) => void) | null = null;
    let sawDoneBanner = false;
    let doneGraceTimer: ReturnType<typeof setTimeout> | null = null;
    let forceStopTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleForceStop = (): void => {
      if (forceStopTimer) clearTimeout(forceStopTimer);
      forceStopTimer = setTimeout(() => {
        stopChild('SIGKILL');
        forceResolveExit?.({ code: null, signal: 'SIGKILL' });
      }, 5_000);
    };
    const hardTimeout = setTimeout(() => {
      if (child.exitCode == null && !child.killed) {
        const message = `⚠ Run exceeded ${Math.round(RUN_HARD_TIMEOUT_MS / 1000)}s. Stopping process.`;
        publishLogEvent(message);
        stopChild('SIGTERM');
        scheduleForceStop();
      }
    }, RUN_HARD_TIMEOUT_MS);

    const outCarry = { value: '' };
    const errCarry = { value: '' };
    const onLogLine = (line: string): void => {
      const trimmed = line.trimEnd();
      if (!trimmed) return;
      publishLogEvent(trimmed);

      if (trimmed.includes('Done.')) {
        sawDoneBanner = true;
        if (doneGraceTimer) clearTimeout(doneGraceTimer);
        doneGraceTimer = setTimeout(() => {
          if (child.exitCode == null && !child.killed) {
            const message = 'ℹ Run completed output detected. Closing lingering process handles…';
            publishLogEvent(message);
            stopChild('SIGTERM');
          }
          scheduleForceStop();
        }, RUN_DONE_GRACE_MS);
      }

      const transcript = parsePathFromLog(trimmed, 'transcript');
      if (transcript) transcriptPaths.add(transcript);
      const json = parsePathFromLog(trimmed, 'reportJson');
      if (json) reportJsonPath = json;
      const html = parsePathFromLog(trimmed, 'reportHtml');
      if (html) reportHtmlPath = html;
    };
    const onErrLine = (line: string): void => {
      const trimmed = line.trimEnd();
      if (!trimmed) return;
      publishLogEvent(trimmed);
      stderrTail = `${stderrTail}\n${trimmed}`.slice(-8_000);
    };

    child.stdout.on('data', (chunk: Buffer) => flushBufferedLines(chunk, outCarry, onLogLine));
    child.stderr.on('data', (chunk: Buffer) => flushBufferedLines(chunk, errCarry, onErrLine));

    const exitInfo = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolveExit) => {
      forceResolveExit = (value) => {
        forceResolveExit = null;
        resolveExit(value);
      };
      child.on('close', (code, signal) => resolveExit({ code, signal: signal as NodeJS.Signals | null }));
      child.on('error', () => resolveExit({ code: 1, signal: null }));
    });

    clearTimeout(hardTimeout);
    if (doneGraceTimer) clearTimeout(doneGraceTimer);
    if (forceStopTimer) clearTimeout(forceStopTimer);
    const exitCode = sawDoneBanner ? 0 : (exitInfo.code ?? 1);

    if (outCarry.value.trim()) onLogLine(outCarry.value.trim());
    if (errCarry.value.trim()) onErrLine(errCarry.value.trim());

    if (transcriptPaths.size === 0) {
      for (const path of findRecentFiles(TRANSCRIPTS_DIR, ['.json'], startedAtMs)) {
        transcriptPaths.add(path);
      }
    }
    if (!reportJsonPath || !existsSync(reportJsonPath)) {
      const recentReports = findRecentFiles(REPORTS_DIR, ['.json'], startedAtMs);
      if (recentReports.length > 0) reportJsonPath = recentReports.at(-1)!;
    }
    if (!reportHtmlPath || !existsSync(reportHtmlPath)) {
      const recentHtml = findRecentFiles(REPORTS_DIR, ['.html'], startedAtMs);
      if (recentHtml.length > 0) reportHtmlPath = recentHtml.at(-1)!;
    }

    finalStatus = exitCode === 0 ? 'completed' : 'failed';
    if (exitCode !== 0) {
      finalError = stderrTail.trim() || (
        exitInfo.signal
          ? `CLI process exited via signal ${exitInfo.signal}`
          : `CLI process exited with code ${exitCode}`
      );
    }

    if (!(await isRunDeleted(runId))) {
      const persistedRefs = await ingestRunArtifacts(
        runId,
        transcriptPaths,
        reportJsonPath,
        reportHtmlPath,
        finalStatus,
      );
      reportJsonRef = persistedRefs.reportJsonRef;
      reportHtmlRef = persistedRefs.reportHtmlRef;
    } else {
      finalStatus = 'failed';
      finalError = 'Run deleted while execution was in progress';
    }
  } catch (err) {
    finalStatus = 'failed';
    finalError = (err as Error).message;
  } finally {
    try {
      unlinkSync(tmpScenarioPath);
    } catch {
      // ignore cleanup failures
    }
  }

  await waitForRunEventQueue(runId);
  await finalizeJob(job, finalStatus, finalError, reportJsonRef, reportHtmlRef);
  clearRunEventQueue(runId);
}

async function clearPreviousRunState(runId: string): Promise<void> {
  await prisma.$transaction([
    prisma.turn.deleteMany({ where: { runId } }),
    prisma.runEvent.deleteMany({ where: { runId } }),
    prisma.evalResult.deleteMany({ where: { runId } }),
    prisma.report.deleteMany({ where: { runId } }),
    prisma.run.updateMany({
      where: { id: runId },
      data: {
        completedAt: null,
        errorMessage: null,
        audioPath: null,
      },
    }),
  ]);
}

async function ingestRunArtifacts(
  runId: string,
  transcriptPaths: Set<string>,
  reportJsonPath: string | null,
  reportHtmlPath: string | null,
  finalStatus: 'completed' | 'failed',
): Promise<{ reportJsonRef: string | null; reportHtmlRef: string | null }> {
  let reportJsonRef: string | null = null;
  let reportHtmlRef: string | null = null;
  const transcripts: Transcript[] = [];
  for (const path of transcriptPaths) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Transcript;
      transcripts.push(parsed);
    } catch {
      // ignore malformed transcript
    }
  }
  transcripts.sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  let mergedTurnIndex = 0;
  const multiScenario = transcripts.length > 1;
  for (const transcript of transcripts) {
    if (multiScenario) {
      await prisma.turn.create({
        data: {
          runId,
          index: mergedTurnIndex++,
          role: 'agent',
          content: `=== ${transcript.scenarioName} ===`,
          timestampMs: BigInt(Date.now()),
        },
      });
    }
    for (const turn of transcript.turns) {
      await prisma.turn.create({
        data: {
          runId,
          index: mergedTurnIndex++,
          role: turn.role,
          content: turn.content,
          durationMs: turn.durationMs,
          timestampMs: BigInt(turn.timestampMs),
        },
      });
    }
  }

  const audioPath = transcripts.map((transcript) => transcript.audioPath).find((path): path is string => !!path);
  if (audioPath) {
    await prisma.run.updateMany({
      where: { id: runId, NOT: { status: 'deleted' } },
      data: { audioPath },
    });
  }

  if (reportJsonPath && existsSync(reportJsonPath)) {
    try {
      const report = JSON.parse(readFileSync(reportJsonPath, 'utf-8')) as AggregatedReportJson;
      const passCount = report.results.filter((result) => result.passed).length;
      const qualityResults = report.results.filter((result) => result.scenarioType !== 'security');
      const securityResults = report.results.filter((result) => result.scenarioType === 'security');
      const scoringResults = qualityResults.length > 0 ? qualityResults : report.results;
      const averageScore =
        scoringResults.length > 0
          ? scoringResults.reduce((sum, result) => sum + result.overallScore, 0) / scoringResults.length
          : 0;

      const runScenarioType =
        qualityResults.length > 0 && securityResults.length > 0
          ? 'mixed'
          : securityResults.length > 0
            ? 'security'
            : 'quality';

      const summary =
        report.results.length > 0
          ? `${passCount}/${report.results.length} passed. Quality score: ${averageScore.toFixed(1)}/10` +
            (securityResults.length > 0
              ? ` (${securityResults.length} security test${securityResults.length > 1 ? 's' : ''} excluded from quality average)`
              : '')
          : 'No evaluation results generated.';

      await prisma.evalResult.upsert({
        where: { runId },
        update: {
          overallScore: Math.round(averageScore * 10) / 10,
          passed: report.results.length > 0 ? passCount === report.results.length : finalStatus === 'completed',
          dimensionScores: JSON.stringify(aggregateDimensionScores(qualityResults.length > 0 ? qualityResults : report.results)),
          summary,
          judgeModel: report.results[0]?.judgeModel ?? 'unknown',
          scenarioType: runScenarioType,
        },
        create: {
          runId,
          overallScore: Math.round(averageScore * 10) / 10,
          passed: report.results.length > 0 ? passCount === report.results.length : finalStatus === 'completed',
          dimensionScores: JSON.stringify(aggregateDimensionScores(qualityResults.length > 0 ? qualityResults : report.results)),
          summary,
          judgeModel: report.results[0]?.judgeModel ?? 'unknown',
          scenarioType: runScenarioType,
        },
      });
    } catch (err) {
      const message = `⚠ Unable to parse report JSON: ${(err as Error).message}`;
      appendRunLogLine(runId, message);
      void publishRunEvent(runId, 'log', { message }).catch((publishErr) => {
        console.error(`Failed to persist log event for run ${runId}: ${(publishErr as Error).message}`);
      });
    }
  }

  if (reportJsonPath && reportHtmlPath && existsSync(reportJsonPath) && existsSync(reportHtmlPath)) {
    reportJsonRef = normalizeArtifactRef('reports', reportJsonPath);
    reportHtmlRef = normalizeArtifactRef('reports', reportHtmlPath);
  }

  if (reportJsonRef && reportHtmlRef) {
    await prisma.report.upsert({
      where: { runId },
      update: { jsonPath: reportJsonRef, htmlPath: reportHtmlRef },
      create: { runId, jsonPath: reportJsonRef, htmlPath: reportHtmlRef },
    });
  }

  return { reportJsonRef, reportHtmlRef };
}

async function finalizeJob(
  job: ClaimedRunJob,
  finalStatus: 'completed' | 'failed',
  finalError: string | null,
  reportJsonRef: string | null,
  reportHtmlRef: string | null,
): Promise<void> {
  const completedAt = new Date();
  const runDeleted = await isRunDeleted(job.runId);
  const effectiveStatus = runDeleted ? 'failed' : finalStatus;
  const effectiveError = runDeleted
    ? finalError ?? 'Run deleted while execution was in progress'
    : finalError;

  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: job.id },
      data: {
        status: effectiveStatus,
        completedAt,
        errorMessage: effectiveError,
      },
    });

    if (!runDeleted) {
      await tx.run.update({
        where: { id: job.runId },
        data: {
          status: effectiveStatus,
          completedAt,
          errorMessage: effectiveError,
        },
      });
    }
  });

  try {
    await persistRunTelemetry(job, completedAt, effectiveStatus, effectiveError);
  } catch (err) {
    const message = `⚠ Unable to persist telemetry: ${(err as Error).message}`;
    appendRunLogLine(job.runId, message);
    await publishRunEventSafe(job.runId, 'log', { message });
    console.error(`Failed to persist run telemetry for ${job.runId}: ${(err as Error).message}`);
  }

  if (effectiveStatus === 'failed') {
    const message = `=== Run failed: ${effectiveError ?? 'Run failed'} ===`;
    appendRunLogLine(job.runId, message);
    await publishRunEventSafe(job.runId, 'failed', {
      runId: job.runId,
      error: effectiveError ?? 'Run failed',
      message,
    });
    return;
  }

  const evalResult = await prisma.evalResult.findUnique({ where: { runId: job.runId } });
  const summary = evalResult?.summary ?? 'Run completed';
  const message = `=== Run completed: ${summary} ===`;
  appendRunLogLine(job.runId, message);
  await publishRunEventSafe(job.runId, 'complete', {
    runId: job.runId,
    overallScore: evalResult?.overallScore ?? null,
    passed: evalResult?.passed ?? null,
    summary,
    reportJsonPath: reportJsonRef,
    reportHtmlPath: reportHtmlRef,
    message,
  });
}

async function persistRunTelemetry(
  job: ClaimedRunJob,
  completedAt: Date,
  status: 'completed' | 'failed',
  errorMessage: string | null,
): Promise<void> {
  const payload = parseRunJobPayload(job.payloadJson);
  const turns = await prisma.turn.findMany({
    where: { runId: job.runId },
    select: { role: true, content: true },
  });
  const tokenEstimate = estimateTokensFromTurns(
    turns
      .filter((turn): turn is { role: 'customer' | 'agent'; content: string } =>
        turn.role === 'customer' || turn.role === 'agent')
      .map((turn) => ({ role: turn.role, content: turn.content })),
  );

  const latencyMs = job.startedAt
    ? Math.max(0, completedAt.getTime() - job.startedAt.getTime())
    : null;
  const failureClass = status === 'failed' ? classifyFailure(errorMessage) : null;

  await prisma.runTelemetry.upsert({
    where: { runId: job.runId },
    update: {
      provider: payload.provider,
      channel: payload.channel,
      status,
      latencyMs,
      tokenInputEstimate: tokenEstimate.inputTokens,
      tokenOutputEstimate: tokenEstimate.outputTokens,
      tokenTotalEstimate: tokenEstimate.totalTokens,
      failureClass,
      estimatorVersion: TOKEN_ESTIMATOR_VERSION,
      completedAt,
    },
    create: {
      runId: job.runId,
      provider: payload.provider,
      channel: payload.channel,
      status,
      latencyMs,
      tokenInputEstimate: tokenEstimate.inputTokens,
      tokenOutputEstimate: tokenEstimate.outputTokens,
      tokenTotalEstimate: tokenEstimate.totalTokens,
      failureClass,
      estimatorVersion: TOKEN_ESTIMATOR_VERSION,
      completedAt,
    },
  });
}

function findRecentFiles(dir: string, extensions: string[], startMs: number): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => extensions.some((ext) => file.endsWith(ext)))
    .map((file) => ({ path: resolve(join(dir, file)), mtimeMs: statSync(join(dir, file)).mtimeMs }))
    .filter((file) => file.mtimeMs >= startMs - 2_000)
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .map((file) => file.path);
}

function parsePathFromLog(line: string, kind: 'transcript' | 'reportJson' | 'reportHtml'): string | null {
  const transcriptMatch = line.match(/transcript saved\s*→\s*(.+\.json)\s*$/i);
  if (kind === 'transcript' && transcriptMatch?.[1]) return resolveLoggedArtifactPath(transcriptMatch[1]);

  const jsonMatch = line.match(/^\s*JSON:\s*(.+\.json)\s*$/);
  if (kind === 'reportJson' && jsonMatch?.[1]) return resolveLoggedArtifactPath(jsonMatch[1]);

  const htmlMatch = line.match(/^\s*HTML:\s*(.+\.html)\s*$/);
  if (kind === 'reportHtml' && htmlMatch?.[1]) return resolveLoggedArtifactPath(htmlMatch[1]);

  return null;
}

function aggregateDimensionScores(results: EvalResult[]): Record<string, DimensionScore> {
  const buckets = new Map<string, { total: number; count: number; reasons: string[]; evidence: string[] }>();
  for (const result of results) {
    for (const [dimensionId, dimension] of Object.entries(result.dimensionScores)) {
      const bucket = buckets.get(dimensionId) ?? { total: 0, count: 0, reasons: [], evidence: [] };
      bucket.total += dimension.score;
      bucket.count += 1;
      if (dimension.justification) bucket.reasons.push(dimension.justification);
      if (dimension.evidence) bucket.evidence.push(dimension.evidence);
      buckets.set(dimensionId, bucket);
    }
  }

  const aggregated: Record<string, DimensionScore> = {};
  for (const [dimensionId, bucket] of buckets.entries()) {
    aggregated[dimensionId] = {
      score: Math.round((bucket.total / Math.max(1, bucket.count)) * 10) / 10,
      justification: bucket.reasons.slice(0, 3).join(' | '),
      evidence: bucket.evidence.slice(0, 3).join('\n'),
    };
  }
  return aggregated;
}

async function isRunDeleted(runId: string): Promise<boolean> {
  const row = await prisma.run.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  return row?.status === 'deleted';
}
