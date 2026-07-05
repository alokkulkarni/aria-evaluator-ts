import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { rateLimitAuth } from '../middleware-auth.js';

function appWith(max: number): Express {
  const app = express();
  // Fixed client IP so the per-IP bucket is deterministic across requests.
  app.set('trust proxy', true);
  app.use((req, _res, next) => {
    Object.defineProperty(req, 'ip', { value: '203.0.113.7', configurable: true });
    next();
  });
  app.post('/guarded', rateLimitAuth(max, 60_000), (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}

describe('rateLimitAuth middleware', () => {
  it('allows up to the limit then returns 429', async () => {
    const app = appWith(3);
    for (let i = 0; i < 3; i++) {
      const ok = await request(app).post('/guarded');
      expect(ok.status).toBe(200);
    }
    const blocked = await request(app).post('/guarded');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many requests/i);
  });
});
