// src/api/routes/artifacts.ts
// Serves run artifacts (reports, transcripts, audio) from the object store so any
// autoscaled instance can serve what another instance wrote. For S3 it redirects
// to a short-lived presigned URL (native HTTP range + caching, offloaded to S3);
// otherwise it streams the object. Local dev keeps express.static (see server.ts).
// Phase 2 of the multi-tenant migration. See docs/MULTI_TENANT_SPEC.md.

import { Router, type Request, type Response } from 'express';
import { extname } from 'node:path';
import { getObjectStore } from '../../runtime/object-store.js';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

function sanitizeTail(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const segments = decoded.replace(/\\/g, '/').split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((s) => s === '.' || s === '..' || s.includes(':'))) return null;
  return segments.join('/');
}

export function artifactRouter(kind: 'reports' | 'transcripts' | 'audio'): Router {
  const router = Router();
  router.get(/.*/, async (req: Request, res: Response) => {
    const tail = sanitizeTail(req.path.replace(/^\/+/, ''));
    if (!tail) return res.status(400).end();
    const key = `${kind}/${tail}`;
    try {
      const store = getObjectStore();
      const url = await store.presignedUrl(key);
      if (url) return res.redirect(url);

      const stream = await store.getStream(key);
      if (!stream) return res.status(404).end();
      const contentType = CONTENT_TYPES[extname(tail).toLowerCase()];
      if (contentType) res.type(contentType);
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
      });
      stream.pipe(res);
    } catch {
      if (!res.headersSent) res.status(500).end();
    }
  });
  return router;
}
