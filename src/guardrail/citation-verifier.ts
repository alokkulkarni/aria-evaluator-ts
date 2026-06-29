// On-demand citation verifier for AI-suggested guardrails. The LLM proposes, per
// citation, an authoritative source URL + a distinctive reference token; the server
// fetches that page and marks the citation as found ONLY if the live page actually
// contains the token. Honest by design: anything we can't confirm is 'unverified'
// (never falsely 'verified'), and outright-fabricated regs come back 'not-found'.
//
// SSRF (CWE-918): the URLs come from LLM output derived partly from user input, so
// fetches are restricted to an allowlist of authoritative public domains over https,
// with a redirect-target recheck. Private/loopback/link-local/metadata hosts are
// never on the allowlist and so are never fetched.
import { z } from 'zod';

import { BedrockJudgeProvider } from '../judge/providers/bedrock.js';
import { htmlToText } from '../rag/crawler.js';

const VERIFIER_MODEL_ID =
  process.env['GUARDRAIL_VERIFIER_MODEL_ID']?.trim() || 'anthropic.claude-haiku-4-5-20251001-v1:0';
const VERIFIER_TIMEOUT_MS = Number(process.env['GUARDRAIL_VERIFIER_TIMEOUT_MS']) || 20000;
const FETCH_TIMEOUT_MS = 6000;
const MAX_FETCHES = 8;
const MAX_CITATIONS = 12;

// Authoritative regulators / standards / official legal sources. Suffix-matched, so
// subdomains (e.g. handbook.fca.org.uk) are covered. Public domains only → no SSRF
// path to internal/metadata addresses.
const AUTHORITATIVE_DOMAINS = [
  'europa.eu',
  'gdpr-info.eu',
  'ecfr.gov',
  'gpo.gov',
  'congress.gov',
  'law.cornell.edu',
  'hhs.gov',
  'ftc.gov',
  'sec.gov',
  'finra.org',
  'consumerfinance.gov',
  'eeoc.gov',
  'hud.gov',
  'ada.gov',
  'nist.gov',
  'naic.org',
  'oecd.org',
  'fca.org.uk',
  'ico.org.uk',
  'gov.uk',
];

export type CitationStatus = 'verified' | 'corrected' | 'not-found' | 'unverified';

export interface CitationVerdict {
  citation: string;
  status: CitationStatus;
  sourceUrl?: string;
  correctedCitation?: string;
  note: string;
}

function isAllowlistedUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return AUTHORITATIVE_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// Normalise for matching: unify "Article"/"Art.", drop periods (so "164.502" and
// "Art. 5" match regardless of punctuation), collapse whitespace.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\barticle\b/g, 'art')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch text from an allowlisted authoritative URL only; recheck the final URL after
// redirects so a redirect can't land us off the allowlist. Returns null on anything
// unexpected (never throws).
async function safeFetchText(url: string): Promise<string | null> {
  if (!isAllowlistedUrl(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'aria-guardrail-citation-verifier' },
    });
    if (!res.ok) return null;
    if (res.url && !isAllowlistedUrl(res.url)) return null; // redirected off the allowlist
    return htmlToText(await res.text());
  } catch {
    return null;
  }
}

const planItemSchema = z.object({
  citation: z.string().min(1),
  matchPhrase: z.string().default(''),
  candidateUrls: z.array(z.string()).default([]),
  likelyReal: z.boolean().default(true),
  correctedCitation: z.string().optional(),
});

const SYSTEM_PROMPT = [
  'You help verify whether regulatory/standard citations are real and where they can be confirmed.',
  'For each citation return JSON: { "citation", "matchPhrase", "candidateUrls", "likelyReal", "correctedCitation"? }.',
  '- candidateUrls: 1-3 https URLs on a PLAIN-HTML official source (these fetch reliably):',
  '    • US Code / CFR → https://www.law.cornell.edu/uscode/text/<title>/<section> or /cfr/text/<title>/<section>',
  '    • EU GDPR article → https://gdpr-info.eu/art-<n>-gdpr/',
  '    • UK legislation → https://www.legislation.gov.uk/...',
  '    • otherwise the official regulator/standards site (ico.org.uk, nist.gov, ftc.gov, sec.gov, finra.org).',
  '  STRONGLY prefer law.cornell.edu / gdpr-info.eu / legislation.gov.uk when applicable; avoid JS-only',
  '  pages (eur-lex, ecfr.gov, handbook.fca.org.uk) — they return no text to a simple fetch.',
  '- matchPhrase: the exact section/article NUMBER token as it appears on that page, e.g. "164.502",',
  '  "1002", "1681", "Art. 5". It must be distinctive (contain a number) — never a bare common word.',
  '- likelyReal: false if you believe the citation is fabricated or not a real instrument.',
  '- correctedCitation: include only if the citation is slightly wrong and you know the right reference.',
  'Respond with ONLY a JSON array (no prose, no markdown fences).',
].join('\n');

function extractJsonArray(text: string): string | null {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('verifier timeout')), ms)),
  ]);
}

const NOTE: Record<CitationStatus, string> = {
  verified: 'Reference found on the official source (confirm it supports this guardrail).',
  corrected: 'Closest official reference appears to differ — see the suggested correction.',
  'not-found': 'No authoritative source could be found for this citation.',
  unverified: 'Could not confirm against a live official source.',
};

function unverifiedAll(citations: string[]): CitationVerdict[] {
  return citations.map((citation) => ({ citation, status: 'unverified', note: NOTE.unverified }));
}

/**
 * Verify a guardrail's citations against authoritative web sources. Never throws —
 * returns a verdict per input citation (anything unconfirmed → 'unverified').
 */
export async function verifyCitations(citations: string[], context: string): Promise<CitationVerdict[]> {
  const targets = citations.slice(0, MAX_CITATIONS);
  if (targets.length === 0) return [];

  let plan: z.infer<typeof planItemSchema>[];
  try {
    const resp = await withTimeout(
      new BedrockJudgeProvider().complete({
        modelId: VERIFIER_MODEL_ID,
        systemPrompt: SYSTEM_PROMPT,
        userPrompt: `Context: ${context}\nCitations to verify:\n${targets.map((c) => `- ${c}`).join('\n')}`,
        temperature: 0,
        maxTokens: 1200,
      }),
      VERIFIER_TIMEOUT_MS,
    );
    const json = extractJsonArray(resp.text);
    const raw: unknown = json ? JSON.parse(json) : null;
    if (!Array.isArray(raw)) return unverifiedAll(targets);
    plan = raw.map((item) => planItemSchema.safeParse(item)).flatMap((p) => (p.success ? [p.data] : []));
  } catch {
    return unverifiedAll(targets);
  }

  // Pre-fetch all allowlisted candidate URLs once (deduped, capped), in parallel.
  const urls = [
    ...new Set(plan.flatMap((p) => p.candidateUrls).filter(isAllowlistedUrl)),
  ].slice(0, MAX_FETCHES);
  const pages = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const text = await safeFetchText(u);
      if (text) pages.set(u, normalize(text));
    }),
  );

  return targets.map((citation) => {
    const item = plan.find((p) => p.citation === citation);
    if (!item) return { citation, status: 'unverified', note: NOTE.unverified };

    const phrase = normalize(item.matchPhrase);
    // Require a distinctive token (avoid 1-2 char generic matches).
    const matchableUrl =
      phrase.length >= 4
        ? item.candidateUrls.filter(isAllowlistedUrl).find((u) => pages.get(u)?.includes(phrase))
        : undefined;

    if (matchableUrl) {
      const status: CitationStatus = item.correctedCitation ? 'corrected' : 'verified';
      const base: CitationVerdict = { citation, status, sourceUrl: matchableUrl, note: NOTE[status] };
      return item.correctedCitation ? { ...base, correctedCitation: item.correctedCitation } : base;
    }
    if (item.likelyReal === false) {
      const base: CitationVerdict = { citation, status: 'not-found', note: NOTE['not-found'] };
      return item.correctedCitation ? { ...base, correctedCitation: item.correctedCitation } : base;
    }
    return { citation, status: 'unverified', note: NOTE.unverified };
  });
}
