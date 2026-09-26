import { healthResponseSchema } from '@fintrack/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../../app.js';
import { buildTestApp, fakeDatabase } from '../../test/helpers.js';

describe('GET /health', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('responde 200 com o contrato compartilhado quando o banco está ok', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    const body = healthResponseSchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe('ok');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('responde 503 com status degraded quando o banco está fora', async () => {
    app = await buildTestApp({
      database: fakeDatabase(() => Promise.reject(new Error('ECONNREFUSED'))),
    });

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'degraded', checks: { database: 'error' } });
  });

  it('não é afetada pelo rate limit (healthcheck do Railway)', async () => {
    app = await buildTestApp({ env: { RATE_LIMIT_MAX: '1' } });

    for (let i = 0; i < 3; i++) {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    }
  });
});
