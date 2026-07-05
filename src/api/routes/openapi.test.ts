import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { openapiRouter } from './openapi.js';

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/openapi', openapiRouter);
  return app;
}

describe('POST /api/openapi/parse — SSRF guard', () => {
  let app: Express;
  beforeEach(() => {
    app = makeApp();
  });

  it('rejects a cloud-metadata URL with 400 (no fetch)', async () => {
    const res = await request(app)
      .post('/api/openapi/parse')
      .send({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Refusing to fetch/i);
  });

  it('rejects a loopback URL with 400', async () => {
    const res = await request(app)
      .post('/api/openapi/parse')
      .send({ url: 'http://127.0.0.1:8080/openapi.json' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-HTTP scheme with 400', async () => {
    const res = await request(app)
      .post('/api/openapi/parse')
      .send({ url: 'file:///etc/passwd' });
    expect(res.status).toBe(400);
  });

  it('parses an inline spec without any network access', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Inline API', version: '1.2.3' },
      servers: [{ url: 'https://api.example.com' }],
      paths: { '/chat': { post: { operationId: 'chat' } } },
    });
    const res = await request(app).post('/api/openapi/parse').send({ spec });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Inline API');
    expect(res.body.baseUrl).toBe('https://api.example.com');
  });

  it('skips prototype-polluting securityScheme keys but keeps valid ones', async () => {
    const spec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      components: {
        securitySchemes: {
          __proto__: { type: 'apiKey', name: 'x', in: 'header' },
          bearerAuth: { type: 'http', scheme: 'bearer' },
        },
      },
      paths: {},
    });
    const res = await request(app).post('/api/openapi/parse').send({ spec });
    expect(res.status).toBe(200);
    expect(res.body.securitySchemes.bearerAuth?.scheme).toBe('bearer');
    // Object prototype must not have been polluted by the '__proto__' key.
    expect(({} as Record<string, unknown>).type).toBeUndefined();
  });
});
