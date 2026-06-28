// Boundary test against the REAL Express app (no stub auth). This verifies the
// mount POSITION in server.ts — i.e. that GET /guardrail-advisor/domains is mounted
// before the global requireAuth and is therefore reachable with no session. The
// stub-app tests can't catch a wrong mount line; this one can.
//
// GET /domains needs no DB/LLM (it reads the taxonomy JSON from disk), so the real
// app is imported without mocks. It must NOT start listening on import (it doesn't —
// server.listen lives inside the startup function).
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../server.js';

describe('guardrail-advisor mount boundary (real app)', () => {
  it('GET /api/guardrail-advisor/domains is public (200 with no cookie)', async () => {
    const res = await request(app).get('/api/guardrail-advisor/domains');
    expect(res.status).toBe(200);
    expect(res.body.domains).toHaveLength(6);
  });
});
