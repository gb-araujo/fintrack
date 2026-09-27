import { afterEach, describe, expect, it } from 'vitest';
import type { App } from '../app.js';
import { buildTestApp } from '../test/helpers.js';

describe('documentação OpenAPI', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('gera o contrato com as rotas de autenticação e usuários', async () => {
    app = await buildTestApp({ env: { API_DOCS_ENABLED: 'true' } });

    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    const spec = response.json<{ paths: Record<string, Record<string, unknown>> }>();
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining([
        '/health',
        '/api/v1/auth/register',
        '/api/v1/auth/login',
        '/api/v1/auth/refresh',
        '/api/v1/auth/logout',
        '/api/v1/users/me',
      ]),
    );
    expect(spec.paths['/api/v1/users/me']?.get).toMatchObject({
      security: [{ bearerAuth: [] }],
    });
  });

  it('fica desligada por padrão em produção', async () => {
    app = await buildTestApp({ env: { NODE_ENV: 'production' } });
    const response = await app.inject({ method: 'GET', url: '/docs/json' });
    expect(response.statusCode).toBe(404);
  });
});
