import { Router, type Response } from 'express';

import { prisma } from '../../db/client.js';
import { loadDomainTaxonomy } from '../../guardrail/data.js';
import { getRecommendations, getUniversalBaseline } from '../../guardrail/engine.js';
import { generateQuestions } from '../../guardrail/clarifier.js';
import { suggestGuardrails } from '../../guardrail/suggester.js';
import { verifyCitations } from '../../guardrail/citation-verifier.js';
import {
  AI_SUGGESTED_ID_PREFIX,
  type ClarifyingAnswers,
  type GuardrailContext,
  type GuardrailRecommendation,
  type GuardrailSeverity,
} from '../../guardrail/types.js';
import {
  createCustomDomain,
  createCustomFunction,
  deleteCustomDomain,
  deleteCustomFunction,
  listCustomEntries,
} from '../../guardrail/custom-entries.js';
import { formatGuardrailForPlatform } from '../../rag/formatter.js';
import {
  createCustomDomainSchema,
  createCustomFunctionSchema,
  createSessionSchema,
  formatSchema,
  recommendSchema,
  verifyCitationsSchema,
} from '../../shared/guardrail-advisor.js';
import { recordAuditEventSafe } from '../audit-log.js';
import { getRequestAuth, requireAdminAuth, requireAuth } from '../auth.js';

export const guardrailAdvisorRouter = Router();

function fail(res: Response, status: number, error: string): void {
  res.status(status).json({ error });
}

// Express types a route param as `string | string[] | undefined`; a `:id` segment
// is always a single value, so normalise to a string.
function readId(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

// Map the structured (and full) clarifying answers onto the session columns.
function deriveSessionFields(answers: ClarifyingAnswers): {
  jurisdiction: string | null;
  userFacing: boolean;
  dataTypes: string;
  autonomyLevel: string | null;
} {
  const j = answers['jurisdiction'];
  const jurisdiction = Array.isArray(j) ? j.join(',') : typeof j === 'string' ? j : null;

  const uf = answers['user-facing'];
  const userFacing = typeof uf === 'string' ? uf !== 'staff' : true;

  const pii = answers['pii-types'];
  const dataTypes = JSON.stringify(Array.isArray(pii) ? pii : typeof pii === 'string' ? [pii] : []);

  const al = answers['autonomy-level'];
  const autonomyLevel = typeof al === 'string' ? al : Array.isArray(al) ? (al[0] ?? null) : null;

  return { jurisdiction, userFacing, dataTypes, autonomyLevel };
}

interface RecommendationRecordRow {
  id: string;
  guardrailId: string;
  guardrailType: string;
  severity: string;
  title: string;
  description: string;
  rationale: string;
  regulations: string;
}

function rowToRecommendation(row: RecommendationRecordRow): GuardrailRecommendation {
  return {
    id: row.guardrailId,
    guardrailType: row.guardrailType,
    severity: row.severity as GuardrailSeverity,
    title: row.title,
    description: row.description,
    rationale: row.rationale,
    regulations: safeJsonArray(row.regulations),
    // Derived from the id prefix, so source survives persistence with no extra column.
    source: row.guardrailId.startsWith(AI_SUGGESTED_ID_PREFIX) ? 'ai-suggested' : 'curated',
  };
}

// GET /domains — public reference data (mounted before the global requireAuth).
guardrailAdvisorRouter.get('/domains', (_req, res) => {
  res.json(loadDomainTaxonomy());
});

// ── Saved custom domains/functions (workspace-scoped; admin-only delete) ─────────

// GET /custom-domains — the tenant's saved custom domains + functions.
guardrailAdvisorRouter.get('/custom-domains', requireAuth, async (req, res) => {
  const tenantId = getRequestAuth(req)?.tenantId ?? '';
  try {
    res.json(await listCustomEntries(tenantId));
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// POST /custom-domains — save a reusable custom domain (any member).
guardrailAdvisorRouter.post('/custom-domains', requireAuth, async (req, res) => {
  const parsed = createCustomDomainSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'label and description are required');
    return;
  }
  const auth = getRequestAuth(req);
  try {
    const domain = await createCustomDomain(
      auth?.tenantId ?? '',
      auth?.userId ?? null,
      parsed.data.label,
      parsed.data.description,
    );
    await recordAuditEventSafe(req, 'guardrail-advisor.custom-domain.create', domain.id, {
      label: domain.label,
    });
    res.status(201).json({ domain });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// POST /custom-functions — save a reusable custom function under a domain (any member).
guardrailAdvisorRouter.post('/custom-functions', requireAuth, async (req, res) => {
  const parsed = createCustomFunctionSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'domainId, label and description are required');
    return;
  }
  const auth = getRequestAuth(req);
  try {
    const fn = await createCustomFunction(
      auth?.tenantId ?? '',
      auth?.userId ?? null,
      parsed.data.domainId,
      parsed.data.label,
      parsed.data.description,
    );
    await recordAuditEventSafe(req, 'guardrail-advisor.custom-function.create', fn.id, {
      domainId: fn.domainId,
      label: fn.label,
    });
    res.status(201).json({ function: fn });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// DELETE /custom-domains/:slug — remove a saved custom domain + its functions (admin only).
guardrailAdvisorRouter.delete('/custom-domains/:slug', requireAuth, requireAdminAuth, async (req, res) => {
  const slug = readId(req.params.slug);
  const tenantId = getRequestAuth(req)?.tenantId ?? '';
  try {
    await deleteCustomDomain(tenantId, slug);
    await recordAuditEventSafe(req, 'guardrail-advisor.custom-domain.delete', slug, {});
    res.json({ ok: true });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// DELETE /custom-functions/:domainId/:slug — remove a saved custom function (admin only).
guardrailAdvisorRouter.delete(
  '/custom-functions/:domainId/:slug',
  requireAuth,
  requireAdminAuth,
  async (req, res) => {
    const domainId = readId(req.params.domainId);
    const slug = readId(req.params.slug);
    const tenantId = getRequestAuth(req)?.tenantId ?? '';
    try {
      await deleteCustomFunction(tenantId, domainId, slug);
      await recordAuditEventSafe(req, 'guardrail-advisor.custom-function.delete', slug, { domainId });
      res.json({ ok: true });
    } catch (err) {
      fail(res, 500, (err as Error).message);
    }
  },
);

// POST /sessions — start a session and return clarifying questions.
guardrailAdvisorRouter.post('/sessions', requireAuth, async (req, res) => {
  const parsed = createSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'domain and subFunction are required');
    return;
  }
  const { domain, subFunction, domainLabel, domainDescription, subFunctionLabel, subFunctionDescription } =
    parsed.data;
  // Free-text context for a user-defined (custom) domain/function — grounds the
  // clarifier now and the AI suggester at /recommend (persisted on the session).
  const context: GuardrailContext = {
    domainLabel,
    domainDescription,
    subFunctionLabel,
    subFunctionDescription,
  };
  const auth = getRequestAuth(req);
  try {
    const session = await prisma.guardrailAdvisorSession.create({
      data: {
        domain,
        subFunction,
        tenantId: auth?.tenantId ?? '',
        domainLabel: domainLabel ?? null,
        domainDescription: domainDescription ?? null,
        subFunctionLabel: subFunctionLabel ?? null,
        subFunctionDescription: subFunctionDescription ?? null,
      },
    });
    const questions = await generateQuestions(domain, subFunction, context);
    await recordAuditEventSafe(req, 'guardrail-advisor.session.create', session.id, { domain, subFunction });
    res.status(201).json({ sessionId: session.id, questions });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// POST /sessions/:id/recommend — submit answers, get + persist recommendations.
guardrailAdvisorRouter.post('/sessions/:id/recommend', requireAuth, async (req, res) => {
  const parsed = recommendSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'answers must be an object of string or string[] values');
    return;
  }
  const id = readId(req.params.id);
  const answers = parsed.data.answers;
  try {
    const session = await prisma.guardrailAdvisorSession.findUnique({ where: { id } });
    if (!session) {
      fail(res, 404, 'Session not found');
      return;
    }

    // Hybrid recommender: a verified curated core + an LLM-suggested expansion (which
    // fails closed to [] — never blocks the recommend response).
    //   • Taxonomy entry → curated core is its domain-specific knowledge-base set.
    //   • Custom (user-defined) entry → no domain-specific set, so the curated core is
    //     the verified UNIVERSAL baseline (applies to any agent), and the suggester runs
    //     in "comprehensive" mode to generate the domain-specific guardrails on top
    //     (grounded by the session's free-text description, de-duped against the baseline).
    const context: GuardrailContext = {
      domainLabel: session.domainLabel ?? undefined,
      domainDescription: session.domainDescription ?? undefined,
      subFunctionLabel: session.subFunctionLabel ?? undefined,
      subFunctionDescription: session.subFunctionDescription ?? undefined,
    };
    const isCustom = Boolean(session.subFunctionDescription || session.domainDescription);
    const curated = isCustom
      ? getUniversalBaseline(answers)
      : await getRecommendations(session.domain, session.subFunction, answers);
    const suggested =
      curated.length > 0 || isCustom
        ? await suggestGuardrails(session.domain, session.subFunction, answers, curated, context, {
            comprehensive: isCustom,
          })
        : [];
    const recommendations = [...curated, ...suggested];

    await prisma.guardrailAdvisorSession.update({
      where: { id },
      data: { ...deriveSessionFields(answers), rawAnswers: JSON.stringify(answers) },
    });
    await prisma.guardrailRecommendationRecord.deleteMany({ where: { sessionId: id } });
    if (recommendations.length > 0) {
      await prisma.guardrailRecommendationRecord.createMany({
        data: recommendations.map((r) => ({
          sessionId: id,
          guardrailId: r.id,
          guardrailType: r.guardrailType,
          severity: r.severity,
          title: r.title,
          description: r.description,
          rationale: r.rationale,
          regulations: JSON.stringify(r.regulations),
        })),
      });
    }

    await recordAuditEventSafe(req, 'guardrail-advisor.recommend', id, {
      domain: session.domain,
      subFunction: session.subFunction,
      count: recommendations.length,
    });

    res.json({
      recommendations: recommendations.map((r) => ({
        id: r.id,
        guardrailType: r.guardrailType,
        severity: r.severity,
        title: r.title,
        description: r.description,
        rationale: r.rationale,
        regulations: r.regulations,
        source: r.source,
      })),
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// POST /sessions/:id/format — generate platform configs for some/all recommendations.
guardrailAdvisorRouter.post('/sessions/:id/format', requireAuth, async (req, res) => {
  const parsed = formatSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'platform is required and must be one of the supported platforms');
    return;
  }
  const id = readId(req.params.id);
  const { platform, guardrailIds } = parsed.data;
  try {
    const session = await prisma.guardrailAdvisorSession.findUnique({ where: { id } });
    if (!session) {
      fail(res, 404, 'Session not found');
      return;
    }

    const records = (await prisma.guardrailRecommendationRecord.findMany({
      where: {
        sessionId: id,
        ...(guardrailIds.length > 0 ? { guardrailId: { in: guardrailIds } } : {}),
      },
    })) as RecommendationRecordRow[];

    const configs = [];
    for (const row of records) {
      const formatted = await formatGuardrailForPlatform(rowToRecommendation(row), platform);
      await prisma.guardrailRecommendationRecord.update({
        where: { id: row.id },
        data: {
          platformConfig: JSON.stringify(formatted),
          sourceDocUrls: JSON.stringify(formatted.sourceDocUrls),
          configGeneratedAt: new Date(),
        },
      });
      configs.push({
        guardrailId: row.guardrailId,
        config: formatted.config,
        language: formatted.language,
        sourceDocUrls: formatted.sourceDocUrls,
        docsFreshAsOf: formatted.docsFreshAsOf,
      });
    }

    await prisma.guardrailAdvisorSession.update({ where: { id }, data: { platform } });
    await recordAuditEventSafe(req, 'guardrail-advisor.format', id, {
      platform,
      count: configs.length,
    });
    res.json({ platform, configs });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// POST /verify — verify an AI-suggested guardrail's citations against authoritative
// web sources (LLM proposes the source, server fetches it, match → grounded verdict).
guardrailAdvisorRouter.post('/verify', requireAuth, async (req, res) => {
  const parsed = verifyCitationsSchema.safeParse(req.body);
  if (!parsed.success) {
    fail(res, 400, 'citations (1–12 non-empty strings) are required');
    return;
  }
  try {
    const results = await verifyCitations(parsed.data.citations, parsed.data.context ?? '');
    await recordAuditEventSafe(req, 'guardrail-advisor.verify-citations', undefined, {
      count: parsed.data.citations.length,
    });
    res.json({ results });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});

// GET /sessions/:id — full session with recommendations + any generated configs.
guardrailAdvisorRouter.get('/sessions/:id', requireAuth, async (req, res) => {
  const id = readId(req.params.id);
  try {
    const session = await prisma.guardrailAdvisorSession.findUnique({
      where: { id },
      include: { recommendations: true },
    });
    if (!session) {
      fail(res, 404, 'Session not found');
      return;
    }

    res.json({
      session: {
        id: session.id,
        domain: session.domain,
        subFunction: session.subFunction,
        domainLabel: session.domainLabel,
        domainDescription: session.domainDescription,
        subFunctionLabel: session.subFunctionLabel,
        subFunctionDescription: session.subFunctionDescription,
        jurisdiction: session.jurisdiction,
        userFacing: session.userFacing,
        dataTypes: safeJsonArray(session.dataTypes),
        autonomyLevel: session.autonomyLevel,
        platform: session.platform,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      recommendations: session.recommendations.map((r) => ({
        id: r.guardrailId,
        guardrailType: r.guardrailType,
        severity: r.severity,
        title: r.title,
        description: r.description,
        rationale: r.rationale,
        regulations: safeJsonArray(r.regulations),
        source: r.guardrailId.startsWith(AI_SUGGESTED_ID_PREFIX) ? 'ai-suggested' : 'curated',
        platformConfig: r.platformConfig ? (JSON.parse(r.platformConfig) as unknown) : null,
        sourceDocUrls: safeJsonArray(r.sourceDocUrls),
        configGeneratedAt: r.configGeneratedAt,
      })),
    });
  } catch (err) {
    fail(res, 500, (err as Error).message);
  }
});
