// src/api/routes/openapi.ts
// Parses an OpenAPI spec URL or JSON/YAML text and returns candidate
// chat endpoints + detected security schemes.

import { Router } from 'express';
import yaml from 'js-yaml';

export const openapiRouter = Router();

interface SecurityScheme {
  type: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: unknown;
}

interface EndpointCandidate {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  score: number;
}

interface ParseResult {
  title: string;
  version: string;
  baseUrl: string;
  endpoints: EndpointCandidate[];
  securitySchemes: Record<string, SecurityScheme>;
  detectedAuth: DetectedAuth | null;
}

interface DetectedAuth {
  authType: 'none' | 'bearer' | 'apikey' | 'basic';
  headerName?: string; // for apikey
  description?: string;
}

const CHAT_PATH_KEYWORDS = [
  '/chat', '/message', '/messages', '/invoke', '/converse',
  '/completions', '/respond', '/query', '/ask', '/talk',
];

/**
 * POST /api/openapi/parse
 * Body: { url?: string, spec?: string }
 * Returns parsed candidates and security info.
 */
openapiRouter.post('/parse', async (req, res) => {
  const { url, spec: specText } = req.body as { url?: string; spec?: string };

  if (!url && !specText) {
    res.status(400).json({ error: 'Provide either "url" or "spec" in the request body' });
    return;
  }

  let raw: string;
  try {
    if (url) {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching spec`);
      raw = await resp.text();
    } else {
      raw = specText!;
    }
  } catch (err) {
    res.status(502).json({ error: `Failed to fetch spec: ${String(err)}` });
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    // Try JSON first, then YAML
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = yaml.load(raw) as Record<string, unknown>;
    }
  } catch (err) {
    res.status(422).json({ error: `Failed to parse spec: ${String(err)}` });
    return;
  }

  try {
    const result = extractSpecInfo(parsed);
    res.json(result);
  } catch (err) {
    res.status(422).json({ error: `Invalid spec structure: ${String(err)}` });
  }
});

function extractSpecInfo(spec: Record<string, unknown>): ParseResult {
  const info = (spec['info'] as Record<string, unknown> | undefined) ?? {};
  const title = String(info['title'] ?? 'Unknown');
  const version = String(info['version'] ?? '');

  // Base URL: prefer servers[0].url
  let baseUrl = '';
  const servers = spec['servers'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(servers) && servers.length > 0) {
    baseUrl = String(servers[0]!['url'] ?? '');
  }
  // Fall back to OAS 2.x host + basePath
  if (!baseUrl && spec['host']) {
    const scheme = String((spec['schemes'] as string[] | undefined)?.[0] ?? 'https');
    baseUrl = `${scheme}://${String(spec['host'])}${String(spec['basePath'] ?? '')}`;
  }

  // Security schemes
  const components = spec['components'] as Record<string, unknown> | undefined;
  const swaggerSecDefs = spec['securityDefinitions'] as Record<string, unknown> | undefined;
  const rawSchemes = (components?.['securitySchemes'] ?? swaggerSecDefs ?? {}) as Record<string, unknown>;
  const securitySchemes: Record<string, SecurityScheme> = {};
  for (const [key, val] of Object.entries(rawSchemes)) {
    securitySchemes[key] = val as SecurityScheme;
  }

  // Detect primary auth
  const detectedAuth = detectAuth(securitySchemes);

  // Endpoint candidates
  const paths = (spec['paths'] as Record<string, unknown> | undefined) ?? {};
  const endpoints: EndpointCandidate[] = [];

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const methods = ['post', 'put', 'get', 'patch'] as const;
    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      const opObj = op as Record<string, unknown>;
      const score = scoreEndpoint(pathStr, method, opObj);
      if (score >= 0) {
        endpoints.push({
          path: pathStr,
          method: method.toUpperCase(),
          operationId: typeof opObj['operationId'] === 'string' ? opObj['operationId'] : undefined,
          summary: typeof opObj['summary'] === 'string' ? opObj['summary'] : undefined,
          score,
        });
      }
    }
  }

  // Sort by score descending, take top 10
  endpoints.sort((a, b) => b.score - a.score);
  const topEndpoints = endpoints.slice(0, 10);

  return { title, version, baseUrl, endpoints: topEndpoints, securitySchemes, detectedAuth };
}

function scoreEndpoint(path: string, method: string, op: Record<string, unknown>): number {
  let score = 0;
  const lp = path.toLowerCase();
  const opId = String(op['operationId'] ?? '').toLowerCase();
  const summary = String(op['summary'] ?? '').toLowerCase();
  const tags = (op['tags'] as string[] | undefined) ?? [];

  // Prefer POST/PUT
  if (method === 'post') score += 10;
  else if (method === 'put') score += 5;

  // Path keyword matching
  for (const kw of CHAT_PATH_KEYWORDS) {
    if (lp.includes(kw)) { score += 20; break; }
  }

  // operationId / summary keyword matching
  const textToSearch = `${opId} ${summary} ${tags.join(' ')}`;
  if (/chat|message|send|invoke|converse|completion|respond|query|ask/.test(textToSearch)) score += 15;

  return score;
}

function detectAuth(schemes: Record<string, SecurityScheme>): DetectedAuth | null {
  for (const [, scheme] of Object.entries(schemes)) {
    if (scheme.type === 'http') {
      if (scheme.scheme === 'bearer') {
        return { authType: 'bearer', description: `Bearer token (${scheme.bearerFormat ?? 'JWT'})` };
      }
      if (scheme.scheme === 'basic') {
        return { authType: 'basic', description: 'HTTP Basic auth' };
      }
    }
    if (scheme.type === 'apiKey') {
      if (scheme.in === 'header') {
        return { authType: 'apikey', headerName: scheme.name, description: `API key header: ${scheme.name}` };
      }
    }
    if (scheme.type === 'oauth2') {
      return { authType: 'bearer', description: 'OAuth2 bearer token' };
    }
  }
  return null;
}
