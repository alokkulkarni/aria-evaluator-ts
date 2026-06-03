import { prisma } from '../db/client.js';
import { createQueuedRun } from './run-jobs.js';
import type { RunJobPayload } from './run-job-payload.js';
import { randomUUID } from 'node:crypto';
import { addMinutes, addHours, addDays, addMonths } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// ── Types ──────────────────────────────────────────────────────────────────────

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';

interface ScheduleContext {
  isRunning: boolean;
  pollIntervalMs: number;
  nextPollAt: Date;
  lastPollAt: Date | null;
  schedulesActive: number;
}

// ── Globals ────────────────────────────────────────────────────────────────────

let scheduleContext: ScheduleContext = {
  isRunning: false,
  pollIntervalMs: 30_000, // Poll every 30s
  nextPollAt: new Date(),
  lastPollAt: null,
  schedulesActive: 0,
};

let pollInterval: NodeJS.Timeout | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function computeNextRunAt(
  baseTime: Date,
  frequency: Frequency,
  hour: number,
  minute: number,
  dayOfWeek: number | null,
  timezone: string,
): Date {
  // Convert base time to target timezone
  const zonedTime = toZonedTime(baseTime, timezone);

  let nextTime: Date;

  if (frequency === 'hourly') {
    // Next hour, at specified minute
    nextTime = addMinutes(addHours(zonedTime, 1), minute - zonedTime.getMinutes());
  } else if (frequency === 'daily') {
    // Tomorrow at specified hour:minute
    nextTime = new Date(zonedTime);
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(hour, minute, 0, 0);
  } else if (frequency === 'weekly') {
    // Next occurrence of dayOfWeek at hour:minute
    nextTime = new Date(zonedTime);
    const targetDay = dayOfWeek ?? 0;
    let daysToAdd = (targetDay - nextTime.getDay() + 7) % 7;
    if (daysToAdd === 0 && (nextTime.getHours() > hour || (nextTime.getHours() === hour && nextTime.getMinutes() >= minute))) {
      daysToAdd = 7;
    }
    nextTime.setDate(nextTime.getDate() + daysToAdd);
    nextTime.setHours(hour, minute, 0, 0);
  } else {
    // monthly
    nextTime = addMonths(zonedTime, 1);
    nextTime.setDate(1); // First of next month
    nextTime.setHours(hour, minute, 0, 0);
  }

  // Convert back to UTC
  return fromZonedTime(nextTime, timezone);
}

// ── Main Executor ──────────────────────────────────────────────────────────────

async function pollSchedules(): Promise<void> {
  try {
    const now = new Date();

    // Query schedules ready to run
    const schedules = await prisma.schedule.findMany({
      where: {
        status: 'active',
        nextRunAt: { lte: now },
        deletedAt: null,
        failureCount: { lt: 10 }, // Assuming maxFailures defaults to 10; can be parameterized
      },
    });

    console.log(`[schedule-executor] Poll: ${schedules.length} schedules ready to run`);
    scheduleContext.schedulesActive = schedules.length;

    for (const schedule of schedules) {
      try {
        await executeSchedule(schedule, now);
      } catch (err) {
        console.error(`[schedule-executor] Error executing schedule ${schedule.id}:`, err);
      }
    }

    scheduleContext.lastPollAt = now;
    scheduleContext.nextPollAt = new Date(now.getTime() + scheduleContext.pollIntervalMs);
  } catch (err) {
    console.error('[schedule-executor] Poll error:', err);
  }
}

async function executeSchedule(
  schedule: any, // Schedule record
  now: Date,
): Promise<void> {
  // Resolve scenario(s) to run
  let targetScenarios: Array<{ id: string; name: string; yamlContent: string }> = [];

  if (schedule.scenarioId) {
    // Specific scenario
    const scenario = await prisma.scenario.findUnique({
      where: { id: schedule.scenarioId },
      select: { id: true, name: true, yamlContent: true },
    });
    if (scenario) {
      targetScenarios.push(scenario);
    }
  } else {
    // All active scenarios
    targetScenarios = await prisma.scenario.findMany({
      where: { lifecycleStatus: 'active' },
      select: { id: true, name: true, yamlContent: true },
    });
  }

  if (targetScenarios.length === 0) {
    console.warn(`[schedule-executor] No scenarios found for schedule ${schedule.id}`);
    return;
  }

  // Queue run(s)
  const runIds: string[] = [];
  for (const scenario of targetScenarios) {
    const runId = randomUUID();
    
    const payload: RunJobPayload = {
      provider: schedule.provider,
      channel: schedule.channel,
      scenarioFiles: [scenario.name],
      scenarioCount: 1,
      yamlContent: scenario.yamlContent,
    };

    await createQueuedRun({
      runId,
      scenarioName: scenario.name,
      channel: schedule.channel,
      payload,
    });

    // Link run to scenario
    await prisma.run.update({
      where: { id: runId },
      data: { scenarioId: scenario.id },
    });

    runIds.push(runId);
  }

  // Create ScheduleRun audit trail
  for (const runId of runIds) {
    await prisma.scheduleRun.create({
      data: {
        scheduleId: schedule.id,
        runId,
        triggeredAt: now,
        status: 'queued',
      },
    });
  }

  // Update schedule
  const nextRunAt = computeNextRunAt(
    now,
    schedule.frequency as Frequency,
    schedule.hour,
    schedule.minute,
    schedule.dayOfWeek,
    schedule.timezone,
  );

  await prisma.schedule.update({
    where: { id: schedule.id },
    data: {
      lastRunAt: now,
      nextRunAt,
      lastStatus: 'pending',
    },
  });

  console.log(`[schedule-executor] Executed schedule ${schedule.name} (${runIds.length} runs)`);
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export async function startScheduleExecutor(): Promise<void> {
  if (scheduleContext.isRunning) {
    console.warn('[schedule-executor] Already running, skipping restart');
    return;
  }

  scheduleContext.isRunning = true;

  // Initial poll
  await pollSchedules();

  // Set up recurring polls
  pollInterval = setInterval(() => {
    void pollSchedules();
  }, scheduleContext.pollIntervalMs);

  console.log('[schedule-executor] Started (polls every 30s)');
}

export async function stopScheduleExecutor(): Promise<void> {
  if (!scheduleContext.isRunning) {
    console.warn('[schedule-executor] Not running, skipping stop');
    return;
  }

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  scheduleContext.isRunning = false;
  console.log('[schedule-executor] Stopped');
}

export function getScheduleExecutorStatus(): ScheduleContext {
  return { ...scheduleContext };
}

// ── Failure tracking via run-events hook ───────────────────────────────────────
// This is called by the run-events when a run completes/fails

export async function updateScheduleRunStatus(
  runId: string,
  status: 'completed' | 'failed',
  errorMessage: string | null,
): Promise<void> {
  const scheduleRun = await prisma.scheduleRun.findFirst({
    where: { runId },
    include: { schedule: true },
  });

  if (!scheduleRun) {
    return; // Not a scheduled run
  }

  const schedule = scheduleRun.schedule;
  const newFailureCount = status === 'failed' ? schedule.failureCount + 1 : 0;
  const shouldPause = newFailureCount >= schedule.maxFailures;

  await prisma.$transaction(async (tx) => {
    // Update ScheduleRun
    await tx.scheduleRun.update({
      where: { id: scheduleRun.id },
      data: {
        status,
        completedAt: new Date(),
        errorMessage,
      },
    });

    // Update Schedule
    await tx.schedule.update({
      where: { id: schedule.id },
      data: {
        lastStatus: status,
        failureCount: newFailureCount,
        status: shouldPause ? 'paused' : undefined,
      },
    });
  });

  if (shouldPause) {
    console.warn(
      `[schedule-executor] Schedule ${schedule.name} paused after ${newFailureCount} consecutive failures`,
    );
  }
}
