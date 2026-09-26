import { afterAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { createDatabase } from '../../db/client.js';
import { testConfig } from '../../test/helpers.js';

/**
 * Integração real com PostgreSQL. Roda apenas com TEST_DATABASE_URL definido
 * (CI e `docker compose up -d db` local). Sem ele, é ignorado.
 */
const databaseUrl = process.env.TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('GET /health com PostgreSQL real', () => {
  const database = createDatabase(databaseUrl ?? '', { maxConnections: 1 });

  afterAll(async () => {
    await database.close();
  });

  it('confirma conexão com o banco', async () => {
    const app = await buildApp({
      config: testConfig({ DATABASE_URL: databaseUrl ?? '' }),
      database,
    });

    const response = await app.inject({ method: 'GET', url: '/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
  });
});
