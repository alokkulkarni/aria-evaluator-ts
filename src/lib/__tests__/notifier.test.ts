// Notifications — pure-module tests.
//
// The notifier delivers run/guardrail/budget/regression events to a single
// HTTPS webhook (Slack-compatible payload: a `text` field plus a structured
// `event` object). Delivery is best-effort: a notification failure must never
// break a run, so sendNotification never throws.

import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_NOTIFY_EVENTS,
  buildWebhookPayload,
  parseNotifierConfig,
  sendNotification,
  shouldNotify,
  signPayload,
  type NotifyEvent,
} from '../notifier.js';

const event: NotifyEvent = {
  type: 'guardrail_failure',
  severity: 'critical',
  title: 'Guardrail failure: prompt injection succeeded',
  body: 'Scenario "banking/injection" failed guardrail_compliance with 2/10.',
  runId: 'run-1',
  scenarioName: 'banking/injection',
  data: { score: 2 },
};

describe('parseNotifierConfig', () => {
  it('returns null when no webhook URL is configured', () => {
    expect(parseNotifierConfig({})).toBeNull();
    expect(parseNotifierConfig({ webhookUrl: '   ' })).toBeNull();
  });

  it('rejects plaintext http URLs (never send events unencrypted)', () => {
    expect(parseNotifierConfig({ webhookUrl: 'http://hooks.example.com/x' })).toBeNull();
  });

  it('accepts https URLs and defaults to the failure-focused event set', () => {
    const cfg = parseNotifierConfig({ webhookUrl: 'https://hooks.example.com/x' })!;
    expect(cfg.webhookUrl).toBe('https://hooks.example.com/x');
    expect([...cfg.enabledEvents].sort()).toEqual([...DEFAULT_NOTIFY_EVENTS].sort());
  });

  it('parses an events CSV, ignoring unknown tokens, and supports "all"', () => {
    const cfg = parseNotifierConfig({
      webhookUrl: 'https://h.example.com/x',
      events: ' run_completed, guardrail_failure , bogus ',
    })!;
    expect([...cfg.enabledEvents].sort()).toEqual(['guardrail_failure', 'run_completed']);

    const all = parseNotifierConfig({ webhookUrl: 'https://h.example.com/x', events: 'all' })!;
    expect(all.enabledEvents.size).toBeGreaterThanOrEqual(5);
  });
});

describe('shouldNotify', () => {
  it('honours the enabled-event set', () => {
    const cfg = parseNotifierConfig({ webhookUrl: 'https://h.example.com/x', events: 'run_failed' })!;
    expect(shouldNotify(cfg, 'run_failed')).toBe(true);
    expect(shouldNotify(cfg, 'run_completed')).toBe(false);
  });
});

describe('buildWebhookPayload', () => {
  it('produces a Slack-compatible text plus a structured event object', () => {
    const payload = buildWebhookPayload(event, '2026-07-20T10:00:00.000Z');
    expect(payload.text).toContain(event.title);
    expect(payload.text).toContain(event.body);
    expect(payload.event).toMatchObject({
      type: 'guardrail_failure',
      severity: 'critical',
      runId: 'run-1',
      scenarioName: 'banking/injection',
      data: { score: 2 },
      occurredAt: '2026-07-20T10:00:00.000Z',
    });
  });
});

describe('signPayload', () => {
  it('computes an HMAC-SHA256 hex signature over the body', () => {
    const body = '{"text":"x"}';
    const expected = createHmac('sha256', 'topsecret').update(body).digest('hex');
    expect(signPayload(body, 'topsecret')).toBe(`sha256=${expected}`);
  });
});

describe('sendNotification', () => {
  const cfg = parseNotifierConfig({
    webhookUrl: 'https://hooks.example.com/x',
    events: 'all',
    secret: 'topsecret',
  })!;

  it('POSTs the payload with a signature header and returns true on 2xx', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const sent = await sendNotification(cfg, event, fetchImpl);
    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://hooks.example.com/x');
    expect(init.method).toBe('POST');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.headers['x-aria-event']).toBe('guardrail_failure');
    expect(init.headers['x-aria-signature']).toBe(signPayload(init.body, 'topsecret'));
    expect(JSON.parse(init.body).event.type).toBe('guardrail_failure');
  });

  it('returns false without calling fetch when the event type is disabled', async () => {
    const quiet = parseNotifierConfig({ webhookUrl: 'https://h.example.com/x', events: 'run_failed' })!;
    const fetchImpl = vi.fn();
    expect(await sendNotification(quiet, event, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns false when the config is null (notifications unconfigured)', async () => {
    const fetchImpl = vi.fn();
    expect(await sendNotification(null, event, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws: non-2xx responses and network errors return false', async () => {
    const bad = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    expect(await sendNotification(cfg, event, bad)).toBe(false);

    const boom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await sendNotification(cfg, event, boom)).toBe(false);
  });
});
