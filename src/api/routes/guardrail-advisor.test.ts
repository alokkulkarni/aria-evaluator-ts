import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks (LLM + DB + audit). The engine is NOT mocked: /recommend exercises the
// real curated knowledge base. ────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  generateQuestions: vi.fn(),
  formatGuardrailForPlatform: vi.fn(),
  recordAuditEventSafe: vi.fn(),
  prisma: {
    guardrailAdvisorSession: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    guardrailRecommendationRecord: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../guardrail/clarifier.js', () => ({ generateQuestions: mocks.generateQuestions }));
vi.mock('../../rag/formatter.js', () => ({ formatGuardrailForPlatform: mocks.formatGuardrailForPlatform }));
vi.mock('../audit-log.js', () => ({
  recordAuditEventSafe: mocks.recordAuditEventSafe,
  recordAuditEvent: vi.fn(),
}));
vi.mock('../../db/client.js', () => ({ prisma: mocks.prisma }));

import { guardrailAdvisorRouter } from './guardrail-advisor.js';

const STUB_AUTH = {
  userId: 'u1',
  username: 'tester',
  role: 'admin',
  sessionId: 's1',
  email: null,
  ssoSubject: null,
  tenantId: '',
  workspaceEligible: true,
  requirePasswordChange: false,
  suspended: false,
};

function makeApp(withAuth = true): Express {
  const app = express();
  app.use(express.json());
  if (withAuth) {
    app.use((req, _res, next) => {
      (req as unknown as { auth: typeof STUB_AUTH }).auth = STUB_AUTH;
      next();
    });
  }
  app.use('/api/guardrail-advisor', guardrailAdvisorRouter);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generateQuestions.mockResolvedValue([
    { id: 'jurisdiction', text: 'Regions?', type: 'multi-choice', options: [{ value: 'EU', label: 'EU' }, { value: 'US', label: 'US' }] },
    { id: 'user-facing', text: 'Who?', type: 'single-choice', options: [{ value: 'customers', label: 'Customers' }, { value: 'staff', label: 'Staff' }] },
    { id: 'notes', text: 'Notes?', type: 'text' },
  ]);
  mocks.prisma.guardrailAdvisorSession.create.mockResolvedValue({ id: 'sess-1', domain: 'banking', subFunction: 'customer-support' });
  mocks.prisma.guardrailAdvisorSession.findUnique.mockResolvedValue({ id: 'sess-1', domain: 'banking', subFunction: 'customer-support' });
  mocks.prisma.guardrailAdvisorSession.update.mockResolvedValue({ id: 'sess-1' });
  mocks.prisma.guardrailRecommendationRecord.deleteMany.mockResolvedValue({ count: 0 });
  mocks.prisma.guardrailRecommendationRecord.createMany.mockResolvedValue({ count: 0 });
  mocks.prisma.guardrailRecommendationRecord.findMany.mockResolvedValue([
    {
      id: 'rec-row-1',
      guardrailId: 'topic-denial-financial-advice',
      guardrailType: 'TOPIC_DENIAL',
      severity: 'REQUIRED',
      title: 'Deny unsolicited financial advice',
      description: 'desc',
      rationale: 'why',
      regulations: JSON.stringify(['FCA COBS 9']),
    },
  ]);
  mocks.prisma.guardrailRecommendationRecord.update.mockResolvedValue({ id: 'rec-row-1' });
  mocks.formatGuardrailForPlatform.mockResolvedValue({
    config: 'guardrail:\n  topicPolicy: deny',
    language: 'yaml',
    sourceDocUrls: ['https://docs.aws.amazon.com/bedrock/guardrails.html'],
    docsFreshAsOf: '2026-06-01T00:00:00.000Z',
  });
});

describe('guardrail-advisor routes', () => {
  it('GET /domains returns all 6 domains (no auth)', async () => {
    const res = await request(makeApp(false)).get('/api/guardrail-advisor/domains');
    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(6);
    expect(res.body.domains.map((d: { id: string }) => d.id)).toEqual(
      expect.arrayContaining(['banking', 'legal', 'healthcare', 'hr', 'insurance', 'retail']),
    );
  });

  it('POST /sessions returns sessionId + questions and audits the creation', async () => {
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions')
      .send({ domain: 'banking', subFunction: 'customer-support' });
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe('sess-1');
    expect(res.body.questions.length).toBeGreaterThanOrEqual(3);
    expect(mocks.recordAuditEventSafe).toHaveBeenCalled();
  });

  it('POST /sessions with missing domain returns 400', async () => {
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions')
      .send({ subFunction: 'customer-support' });
    expect(res.status).toBe(400);
  });

  it('POST /sessions/:id/recommend returns recommendations grouped by severity', async () => {
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions/sess-1/recommend')
      .send({ answers: { jurisdiction: 'EU' } });
    expect(res.status).toBe(200);
    const recs = res.body.recommendations as { id: string; severity: string }[];
    expect(recs.length).toBeGreaterThan(0);
    // REQUIRED come first; engine + EU augmentation produce a GDPR entry.
    expect(recs[0]!.severity).toBe('REQUIRED');
    expect(recs.map((r) => r.id)).toContain('gdpr-data-subject-rights');
    expect(mocks.prisma.guardrailRecommendationRecord.createMany).toHaveBeenCalled();
  });

  it('POST /sessions/:id/recommend returns 404 for an unknown session', async () => {
    mocks.prisma.guardrailAdvisorSession.findUnique.mockResolvedValueOnce(null);
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions/nope/recommend')
      .send({ answers: {} });
    expect(res.status).toBe(404);
  });

  it('POST /sessions/:id/format returns configs with sourceDocUrls', async () => {
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions/sess-1/format')
      .send({ platform: 'bedrock', guardrailIds: [] });
    expect(res.status).toBe(200);
    expect(res.body.platform).toBe('bedrock');
    expect(res.body.configs).toHaveLength(1);
    expect(res.body.configs[0].sourceDocUrls).toEqual(['https://docs.aws.amazon.com/bedrock/guardrails.html']);
    expect(res.body.configs[0].language).toBe('yaml');
    expect(res.body.configs[0].docsFreshAsOf).toBeTruthy();
  });

  it('POST /sessions/:id/format with an invalid platform returns 400', async () => {
    const res = await request(makeApp())
      .post('/api/guardrail-advisor/sessions/sess-1/format')
      .send({ platform: 'not-a-platform', guardrailIds: [] });
    expect(res.status).toBe(400);
  });

  it('protected routes require auth (per-route requireAuth) — 401 without auth', async () => {
    const res = await request(makeApp(false))
      .post('/api/guardrail-advisor/sessions')
      .send({ domain: 'banking', subFunction: 'customer-support' });
    expect(res.status).toBe(401);
  });
});
