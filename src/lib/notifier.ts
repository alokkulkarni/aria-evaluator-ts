// src/lib/notifier.ts
// Outbound notifications for run lifecycle and safety events.
//
// One HTTPS webhook, Slack-compatible payload: the JSON body carries a `text`
// field (rendered as-is by Slack incoming webhooks) plus a structured `event`
// object for machine consumers. Optional HMAC-SHA256 signing lets receivers
// verify authenticity. Delivery is best-effort — a notification failure must
// never break a run, so sendNotification logs and returns false instead of
// throwing.
//
// Configuration comes from runtime settings (see getNotifierConfig() in
// src/api/runtime-settings.ts): NOTIFY_WEBHOOK_URL, NOTIFY_EVENTS,
// NOTIFY_WEBHOOK_SECRET.

import { createHmac } from 'node:crypto';

export type NotifyEventType =
  | 'run_completed'
  | 'run_failed'
  | 'guardrail_failure'
  | 'budget_exceeded'
  | 'regression_detected';

export type NotifySeverity = 'info' | 'warning' | 'critical';

export interface NotifyEvent {
  type: NotifyEventType;
  severity: NotifySeverity;
  /** Short human-readable headline. */
  title: string;
  /** Detail line(s) — kept short; deep links belong in `data`. */
  body: string;
  runId?: string;
  scenarioName?: string;
  /** Structured extras for machine consumers (scores, deltas, URLs). */
  data?: Record<string, unknown>;
}

export const ALL_NOTIFY_EVENTS: NotifyEventType[] = [
  'run_completed',
  'run_failed',
  'guardrail_failure',
  'budget_exceeded',
  'regression_detected',
];

/**
 * Default event set: failures only. run_completed is opt-in (via
 * NOTIFY_EVENTS) so a healthy pipeline doesn't spam the channel.
 */
export const DEFAULT_NOTIFY_EVENTS: NotifyEventType[] = [
  'run_failed',
  'guardrail_failure',
  'budget_exceeded',
  'regression_detected',
];

export interface NotifierConfig {
  webhookUrl: string;
  secret?: string;
  enabledEvents: Set<NotifyEventType>;
}

/** Per-delivery wall-clock cap so a slow webhook can't stall a run. */
const NOTIFY_TIMEOUT_MS = 5_000;

const SEVERITY_BADGE: Record<NotifySeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🔴',
};

/**
 * Build a NotifierConfig from raw settings values. Returns null when
 * notifications are unconfigured or the URL is unusable — callers treat null
 * as "notifications off". Plaintext http URLs are rejected outright: run
 * outcomes and scenario names must never leave the host unencrypted.
 */
export function parseNotifierConfig(settings: {
  webhookUrl?: string;
  events?: string;
  secret?: string;
}): NotifierConfig | null {
  const webhookUrl = settings.webhookUrl?.trim();
  if (!webhookUrl) return null;
  if (!webhookUrl.startsWith('https://')) {
    console.warn(`  ⚠  NOTIFY_WEBHOOK_URL must be https — notifications disabled.`);
    return null;
  }

  const eventsRaw = settings.events?.trim().toLowerCase();
  let enabledEvents: Set<NotifyEventType>;
  if (!eventsRaw || eventsRaw === 'default') {
    enabledEvents = new Set(DEFAULT_NOTIFY_EVENTS);
  } else if (eventsRaw === 'all') {
    enabledEvents = new Set(ALL_NOTIFY_EVENTS);
  } else {
    enabledEvents = new Set(
      eventsRaw
        .split(',')
        .map((t) => t.trim())
        .filter((t): t is NotifyEventType => (ALL_NOTIFY_EVENTS as string[]).includes(t)),
    );
  }

  const secret = settings.secret?.trim();
  return { webhookUrl, enabledEvents, ...(secret ? { secret } : {}) };
}

export function shouldNotify(config: NotifierConfig, type: NotifyEventType): boolean {
  return config.enabledEvents.has(type);
}

export interface WebhookPayload {
  /** Slack-compatible message text (Slack incoming webhooks render this field). */
  text: string;
  event: NotifyEvent & { occurredAt: string };
}

export function buildWebhookPayload(event: NotifyEvent, occurredAt?: string): WebhookPayload {
  return {
    text: `${SEVERITY_BADGE[event.severity]} ${event.title}\n${event.body}`,
    event: { ...event, occurredAt: occurredAt ?? new Date().toISOString() },
  };
}

/** HMAC-SHA256 signature over the exact request body, hex-encoded. */
export function signPayload(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number }>;

/**
 * Deliver an event to the configured webhook. Best-effort: returns true only
 * on a 2xx response; disabled/unconfigured events and any delivery failure
 * (non-2xx, network error, timeout) return false without throwing.
 */
export async function sendNotification(
  config: NotifierConfig | null,
  event: NotifyEvent,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<boolean> {
  if (!config || !shouldNotify(config, event.type)) return false;

  const body = JSON.stringify(buildWebhookPayload(event));
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-aria-event': event.type,
  };
  if (config.secret) headers['x-aria-signature'] = signPayload(body, config.secret);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NOTIFY_TIMEOUT_MS);
  try {
    const resp = await fetchImpl(config.webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn(`  ⚠  Notification webhook responded ${resp.status} for ${event.type}.`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`  ⚠  Notification delivery failed for ${event.type}: ${(err as Error).message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
