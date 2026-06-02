import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { prisma } from '../db/client.js';
import { publishRunEvent } from './run-events.js';
import type { RunJobPayload } from './run-job-payload.js';
import { serializeRunJobPayload } from './run-job-payload.js';
import { appendRunLogLine } from './run-logs.js';
import { executeRunJob } from './run-executor.js';

type ClaimedRunJob = Prisma.JobGetPayload<{ include: { run: true } }>;

const RUN_JOB_POLL_INTERVAL_MS = Math.max(
  250,
  Number.parseInt(process.env['RUN_JOB_POLL_INTERVAL_MS'] ?? '1000', 10) || 1000,
);
const MAX_RUN_JOB_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env['MAX_RUN_JOB_ATTEMPTS'] ?? '2', 10) || 2,
);

const workerId = randomUUID();
let workerStarted = false;
let workerTimer: ReturnType<typeof setTimeout> | null = null;

export async function createQueuedRun(params: {
  runId: string;
  scenarioName: string;
  channel: 'chat' | 'voice';
  payload: RunJobPayload;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.run.create({
      data: {
        id: params.runId,
        scenarioName: params.scenarioName,
        channel: params.channel,
        status: 'pending',
      },
    });
    await tx.job.create({
      data: {
        runId: params.runId,
        status: 'queued',
        payloadJson: serializeRunJobPayload(params.payload),
      },
    });
  });

  const queuedAt = new Date().toISOString();
  const message = `=== Run queued at ${queuedAt} ===`;
  appendRunLogLine(params.runId, message);
  await publishRunEventSafe(params.runId, 'queued', {
    runId: params.runId,
    scenarioName: params.scenarioName,
    channel: params.channel,
    queuedAt,
    message,
  });
}

export async function startRunJobWorker(): Promise<void> {
  if (workerStarted) return;
  workerStarted = true;

  const recovery = await recoverStaleRunJobs();
  if (recovery.requeued > 0 || recovery.failed > 0 || recovery.reconciled > 0) {
    console.log(
      `Recovered run jobs: ${recovery.requeued} requeued, ${recovery.failed} failed, ${recovery.reconciled} reconciled.`,
    );
  }

  scheduleNextJob(0);
}

async function recoverStaleRunJobs(): Promise<{ requeued: number; failed: number; reconciled: number }> {
  const runningJobs = await prisma.job.findMany({
    where: { status: 'running' },
    include: { run: true },
    orderBy: { createdAt: 'asc' },
  });

  let requeued = 0;
  let failed = 0;
  let reconciled = 0;

  for (const job of runningJobs) {
    const now = new Date();

    if (job.run.status === 'completed' || job.run.status === 'failed') {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: job.run.status,
          completedAt: job.run.completedAt ?? now,
          errorMessage: job.run.errorMessage,
        },
      });
      reconciled += 1;
      continue;
    }

    if (job.run.status === 'deleted') {
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: now,
          errorMessage: 'Run was deleted before recovery completed',
        },
      });
      const message = '=== Run deleted before recovery. Marking queued job as failed. ===';
      appendRunLogLine(job.runId, message);
      await publishRunEventSafe(job.runId, 'failed', {
        runId: job.runId,
        error: 'Run was deleted before recovery completed',
        message,
      });
      failed += 1;
      continue;
    }

    if (job.attemptCount >= MAX_RUN_JOB_ATTEMPTS) {
      const errorMessage = 'Abandoned after crash recovery exceeded the retry limit.';
      await prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completedAt: now,
            errorMessage,
          },
        });
        await tx.run.update({
          where: { id: job.runId },
          data: {
            status: 'failed',
            completedAt: now,
            errorMessage,
          },
        });
      });
      const message = `=== Run failed: ${errorMessage} ===`;
      appendRunLogLine(job.runId, message);
      await publishRunEventSafe(job.runId, 'failed', {
        runId: job.runId,
        error: errorMessage,
        message,
      });
      failed += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.turn.deleteMany({ where: { runId: job.runId } });
      await tx.evalResult.deleteMany({ where: { runId: job.runId } });
      await tx.report.deleteMany({ where: { runId: job.runId } });
      await tx.job.update({
        where: { id: job.id },
        data: {
          status: 'queued',
          workerId: null,
          claimedAt: null,
          startedAt: null,
          completedAt: null,
          errorMessage: 'Recovered after the previous worker stopped unexpectedly.',
        },
      });
      await tx.run.update({
        where: { id: job.runId },
        data: {
          status: 'pending',
          startedAt: null,
          completedAt: null,
          errorMessage: null,
          audioPath: null,
        },
      });
    });
    const message = '=== Run recovered after worker interruption. Re-queued for execution. ===';
    appendRunLogLine(job.runId, message);
    await publishRunEventSafe(job.runId, 'queued', {
      runId: job.runId,
      queuedAt: now.toISOString(),
      message,
      recovered: true,
    });
    requeued += 1;
  }

  return { requeued, failed, reconciled };
}

function scheduleNextJob(delayMs: number): void {
  workerTimer = setTimeout(() => {
    void runJobWorkerTick();
  }, delayMs);
  workerTimer.unref?.();
}

async function runJobWorkerTick(): Promise<void> {
  let claimedJob: ClaimedRunJob | null = null;
  let nextDelay = RUN_JOB_POLL_INTERVAL_MS;

  try {
    claimedJob = await claimNextQueuedRunJob();
    if (!claimedJob) {
      return;
    }

    nextDelay = 0;
    await executeRunJob(claimedJob);
  } catch (err) {
    console.error(`Run job worker error: ${(err as Error).message}`);
    if (claimedJob) {
      try {
        await failClaimedRunJob(claimedJob, (err as Error).message);
      } catch (failErr) {
        console.error(`Unable to mark claimed job as failed: ${(failErr as Error).message}`);
      }
    }
  } finally {
    scheduleNextJob(nextDelay);
  }
}

async function claimNextQueuedRunJob(): Promise<ClaimedRunJob | null> {
  const claimedAt = new Date();
  const claimedAtIso = claimedAt.toISOString();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.$executeRawUnsafe(
      `UPDATE "Job"
       SET "status" = 'running',
           "workerId" = ?,
           "claimedAt" = ?,
           "startedAt" = ?,
           "attemptCount" = "attemptCount" + 1,
           "updatedAt" = ?
       WHERE "id" = (
         SELECT j."id"
         FROM "Job" j
         JOIN "Run" r ON r."id" = j."runId"
         WHERE j."status" = 'queued'
           AND r."status" != 'deleted'
         ORDER BY j."createdAt" ASC
         LIMIT 1
       )`,
      workerId,
      claimedAtIso,
      claimedAtIso,
      claimedAtIso,
    );

    if (updated === 0) return null;

    const job = await tx.job.findFirst({
      where: {
        workerId,
        status: 'running',
      },
      include: { run: true },
      orderBy: { claimedAt: 'desc' },
    });
    if (!job) return null;

    await tx.run.update({
      where: { id: job.runId },
      data: {
        status: 'running',
        startedAt: claimedAt,
        completedAt: null,
        errorMessage: null,
        audioPath: null,
      },
    });

    return {
      ...job,
      run: {
        ...job.run,
        status: 'running',
        startedAt: claimedAt,
        completedAt: null,
        errorMessage: null,
        audioPath: null,
      },
      startedAt: claimedAt,
      claimedAt,
      attemptCount: job.attemptCount,
    };
  });
}

async function failClaimedRunJob(job: ClaimedRunJob, errorMessage: string): Promise<void> {
  const completedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.job.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt,
        errorMessage,
      },
    });

    if (job.run.status !== 'deleted') {
      await tx.run.update({
        where: { id: job.runId },
        data: {
          status: 'failed',
          completedAt,
          errorMessage,
        },
      });
    }
  });

  appendRunLogLine(job.runId, `=== Run failed: ${errorMessage} ===`);
  await publishRunEventSafe(job.runId, 'failed', {
    runId: job.runId,
    error: errorMessage,
  });
}

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
