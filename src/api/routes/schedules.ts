// src/api/routes/schedules.ts
// Provides CRUD endpoints for schedules and execution control

import { Router } from 'express';
import { prisma } from '../../db/client.js';
import { createQueuedRun } from '../../jobs/run-jobs.js';
import type { RunJobPayload, RunProvider } from '../../jobs/run-job-payload.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { checkRunQuota } from '../../shared/quota-enforcement.js';
import { getUsageLimits } from '../../shared/usage-limits.js';
import { addHours, addDays, addMonths, parseISO, isValid, addMinutes } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { randomUUID } from 'node:crypto';

export const schedulesRouter = Router();

// ── Validators ──────────────────────────────────────────────────────────────────

const VALID_FREQUENCIES = new Set(['hourly', 'daily', 'weekly', 'monthly']);
const VALID_STATUSES = new Set(['active', 'paused', 'archived']);
const VALID_CHANNELS = new Set(['chat', 'voice']);
const IANA_TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai',
];

function validateIANATimezone(tz: string): boolean {
  return IANA_TIMEZONES.includes(tz) || /^[A-Za-z_]+\/[A-Za-z_]+$/.test(tz);
}

function computeNextRunAt(
  now: Date,
  frequency: string,
  hour: number,
  minute: number,
  dayOfWeek: number | null,
  timezone: string,
): Date {
  const zonedTime = toZonedTime(now, timezone);

  let nextTime: Date;

  if (frequency === 'hourly') {
    nextTime = new Date(zonedTime);
    nextTime.setHours(nextTime.getHours() + 1, minute, 0, 0);
  } else if (frequency === 'daily') {
    nextTime = new Date(zonedTime);
    nextTime.setDate(nextTime.getDate() + 1);
    nextTime.setHours(hour, minute, 0, 0);
  } else if (frequency === 'weekly') {
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
    nextTime = new Date(zonedTime);
    nextTime.setMonth(nextTime.getMonth() + 1);
    nextTime.setDate(1);
    nextTime.setHours(hour, minute, 0, 0);
  }

  return fromZonedTime(nextTime, timezone);
}

function parseSingleQueryString(raw: unknown): string | undefined {
  if (Array.isArray(raw)) return undefined;
  if (typeof raw === 'string') return raw;
  return undefined;
}

// ── Routes ──────────────────────────────────────────────────────────────────────

// POST /api/schedules — Create schedule
schedulesRouter.post('/', async (req, res) => {
  // Gate schedule creation behind run quota — a schedule that can never run is useless
  const quota = await checkRunQuota(1, req.body?.provider ?? 'connect');
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

  try {
    const {
      name,
      description,
      frequency,
      hour,
      minute,
      dayOfWeek,
      timezone = 'America/New_York',
      scenarioId,
      scenarioFile,
      provider = 'connect',
      channel = 'chat',
      customMetadata,
    } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'name required, max 100 chars' });
    }

    if (!frequency || !VALID_FREQUENCIES.has(frequency)) {
      return res.status(400).json({
        error: 'frequency must be one of: hourly, daily, weekly, monthly',
      });
    }

    if (typeof hour !== 'number' || hour < 0 || hour > 23) {
      return res.status(400).json({ error: 'hour must be 0-23' });
    }

    if (typeof minute !== 'number' || minute < 0 || minute > 59) {
      return res.status(400).json({ error: 'minute must be 0-59' });
    }

    if (frequency === 'weekly' && (typeof dayOfWeek !== 'number' || dayOfWeek < 0 || dayOfWeek > 6)) {
      return res.status(400).json({ error: 'dayOfWeek required for weekly, must be 0-6' });
    }

    if (!validateIANATimezone(timezone)) {
      return res.status(400).json({ error: 'timezone must be valid IANA timezone' });
    }

    if (!VALID_CHANNELS.has(channel)) {
      return res.status(400).json({ error: 'channel must be chat or voice' });
    }

    if (scenarioId) {
      const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
      if (!scenario) {
        return res.status(404).json({ error: 'scenarioId not found' });
      }
    }

    // Check name uniqueness
    const existing = await prisma.schedule.findUnique({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: 'name already exists' });
    }

    // Compute nextRunAt
    const nextRunAt = computeNextRunAt(new Date(), frequency, hour, minute, dayOfWeek, timezone);

    const schedule = await prisma.schedule.create({
      data: {
        name,
        description: description || null,
        frequency,
        hour,
        minute,
        dayOfWeek: dayOfWeek ?? null,
        timezone,
        scenarioId: scenarioId || null,
        scenarioFile: scenarioFile || null,
        provider,
        channel,
        customMetadata: customMetadata ? JSON.stringify(customMetadata) : null,
        nextRunAt,
        createdBy: 'system', // TODO: Get from auth context
      },
    });

    await recordAuditEventSafe(req, 'create_schedule', `Created schedule: ${name}`, { scheduleId: schedule.id });

    return res.status(201).json(schedule);
  } catch (err) {
    console.error('Error creating schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/schedules — List schedules
schedulesRouter.get('/', async (req, res) => {
  try {
    const status = parseSingleQueryString(req.query['status']);

    const where: any = { deletedAt: null };
    if (status && VALID_STATUSES.has(status)) {
      where.status = status;
    }

    const schedules = await prisma.schedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        scheduleRuns: { orderBy: { triggeredAt: 'desc' }, take: 5 },
      },
    });

    return res.json(schedules);
  } catch (err) {
    console.error('Error listing schedules:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/schedules/:id — Get schedule detail with recent runs
schedulesRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: {
        scheduleRuns: { orderBy: { triggeredAt: 'desc' }, take: 20 },
      },
    });

    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    return res.json(schedule);
  } catch (err) {
    console.error('Error fetching schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/schedules/:id — Update schedule
schedulesRouter.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      description,
      frequency,
      hour,
      minute,
      dayOfWeek,
      timezone,
      scenarioId,
      provider,
      channel,
      maxFailures,
    } = req.body;

    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Validate updates
    if (frequency && !VALID_FREQUENCIES.has(frequency)) {
      return res.status(400).json({ error: 'Invalid frequency' });
    }

    if (hour !== undefined && (typeof hour !== 'number' || hour < 0 || hour > 23)) {
      return res.status(400).json({ error: 'hour must be 0-23' });
    }

    if (minute !== undefined && (typeof minute !== 'number' || minute < 0 || minute > 59)) {
      return res.status(400).json({ error: 'minute must be 0-59' });
    }

    if (timezone && !validateIANATimezone(timezone)) {
      return res.status(400).json({ error: 'Invalid timezone' });
    }

    if (channel && !VALID_CHANNELS.has(channel)) {
      return res.status(400).json({ error: 'Invalid channel' });
    }

    if (scenarioId) {
      const scenario = await prisma.scenario.findUnique({ where: { id: scenarioId } });
      if (!scenario) {
        return res.status(404).json({ error: 'scenarioId not found' });
      }
    }

    // Compute nextRunAt if frequency/time changed
    const newFrequency = frequency || schedule.frequency;
    const newHour = hour ?? schedule.hour;
    const newMinute = minute ?? schedule.minute;
    const newDayOfWeek = dayOfWeek ?? schedule.dayOfWeek;
    const newTimezone = timezone || schedule.timezone;

    const nextRunAt = computeNextRunAt(new Date(), newFrequency, newHour, newMinute, newDayOfWeek, newTimezone);

    const updated = await prisma.schedule.update({
      where: { id },
      data: {
        description: description !== undefined ? description : undefined,
        frequency: frequency || undefined,
        hour: hour !== undefined ? hour : undefined,
        minute: minute !== undefined ? minute : undefined,
        dayOfWeek: dayOfWeek !== undefined ? dayOfWeek : undefined,
        timezone: timezone || undefined,
        scenarioId: scenarioId !== undefined ? (scenarioId || null) : undefined,
        provider: provider || undefined,
        channel: channel || undefined,
        maxFailures: maxFailures !== undefined ? maxFailures : undefined,
        nextRunAt,
      },
    });

    await recordAuditEventSafe(req, 'update_schedule', `Updated schedule: ${schedule.name}`, { scheduleId: id });

    return res.json(updated);
  } catch (err) {
    console.error('Error updating schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/schedules/:id — Soft delete schedule
schedulesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    await prisma.schedule.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'archived' },
    });

    await recordAuditEventSafe(req, 'delete_schedule', `Deleted schedule: ${schedule.name}`, { scheduleId: id });

    return res.status(204).send();
  } catch (err) {
    console.error('Error deleting schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/schedules/:id/pause — Pause schedule
schedulesRouter.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: 'paused', nextRunAt: new Date(9999, 0, 1) }, // Far future to skip polls
    });

    await recordAuditEventSafe(req, 'pause_schedule', `Paused schedule: ${schedule.name}`, { scheduleId: id });

    return res.json(updated);
  } catch (err) {
    console.error('Error pausing schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/schedules/:id/resume — Resume schedule
schedulesRouter.post('/:id/resume', async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await prisma.schedule.findUnique({ where: { id } });
    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Recompute nextRunAt
    const nextRunAt = computeNextRunAt(
      new Date(),
      schedule.frequency,
      schedule.hour,
      schedule.minute,
      schedule.dayOfWeek,
      schedule.timezone,
    );

    const updated = await prisma.schedule.update({
      where: { id },
      data: { status: 'active', nextRunAt, failureCount: 0 },
    });

    await recordAuditEventSafe(req, 'resume_schedule', `Resumed schedule: ${schedule.name}`, { scheduleId: id });

    return res.json(updated);
  } catch (err) {
    console.error('Error resuming schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/schedules/:id/trigger-now — Trigger immediate run
schedulesRouter.post('/:id/trigger-now', async (req, res) => {
  try {
    const { id } = req.params;

    const schedule = await prisma.schedule.findUnique({
      where: { id },
      include: { scenario: { select: { id: true } } },
    });

    if (!schedule || schedule.deletedAt) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Determine scenarioId to use
    let scenarioId: string | undefined;
    if (schedule.scenarioId) {
      scenarioId = schedule.scenarioId;
    } else {
      // Pick first active scenario
      const firstScenario = await prisma.scenario.findFirst({
        where: { lifecycleStatus: 'active' },
        select: { id: true },
      });
      if (!firstScenario) {
        return res.status(400).json({ error: 'No active scenarios available' });
      }
      scenarioId = firstScenario.id;
    }

    // Create run
    const runId = randomUUID();
    const scenario = await prisma.scenario.findUnique({
      where: { id: scenarioId },
      select: { name: true, yamlContent: true },
    });
    if (!scenario) {
      return res.status(404).json({ error: 'Scenario not found' });
    }

    const channelValue = (schedule.channel === 'chat' || schedule.channel === 'voice') 
      ? schedule.channel 
      : 'chat';

    const payload: RunJobPayload = {
      provider: schedule.provider as RunProvider,
      channel: channelValue,
      scenarioFiles: [scenario.name],
      scenarioCount: 1,
      yamlContent: scenario.yamlContent,
    };

    await createQueuedRun({
      runId,
      scenarioName: scenario.name,
      channel: channelValue,
      payload,
    });

    // Link run to scenario
    await prisma.run.update({
      where: { id: runId },
      data: { scenarioId },
    });

    // Create ScheduleRun record
    await prisma.scheduleRun.create({
      data: {
        scheduleId: id,
        runId,
        triggeredAt: new Date(),
        status: 'queued',
      },
    });

    await recordAuditEventSafe(req, 'trigger_schedule', `Manually triggered schedule: ${schedule.name}`, {
      scheduleId: id,
      runId,
    });

    return res.json({ runId });
  } catch (err) {
    console.error('Error triggering schedule:', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});
