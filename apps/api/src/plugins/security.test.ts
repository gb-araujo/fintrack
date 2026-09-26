import { apiErrorSchema } from '@fintrack/shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app.js';
import { buildTestApp } from '../test/helpers.js';

describe('segurança HTTP', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('envia cabeçalhos de segurança (helmet)', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBeDefined();
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });

  it('CORS permite apenas as origens configuradas', async () => {
    app = await buildTestApp({ env: { CORS_ORIGINS: 'https://app.fintrack.dev' } });

    const allowed = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/anything',
      headers: {
        origin: 'https://app.fintrack.dev',
        'access-control-request-method': 'POST',
      },
    });
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.fintrack.dev');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/anything',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limit responde 429 no envelope padrão', async () => {
    app = await buildTestApp({ env: { RATE_LIMIT_MAX: '2' } });
    app.get('/test/limited', () => ({ ok: true }));

    await app.inject({ method: 'GET', url: '/test/limited' });
    await app.inject({ method: 'GET', url: '/test/limited' });
    const response = await app.inject({ method: 'GET', url: '/test/limited' });

    expect(response.statusCode).toBe(429);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('RATE_LIMITED');
    expect(response.headers['retry-after']).toBeDefined();
  });
});
