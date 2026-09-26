import { apiErrorSchema } from '@fintrack/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { App } from '../app.js';
import { NotFoundError } from '../shared/errors/index.js';
import { buildTestApp } from '../test/helpers.js';

describe('tratamento centralizado de erros', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('rota inexistente → 404 no envelope padrão', async () => {
    app = await buildTestApp();

    const response = await app.inject({ method: 'GET', url: '/api/v1/nao-existe' });

    expect(response.statusCode).toBe(404);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('NOT_FOUND');
  });

  it('erro de validação Zod → 400 VALIDATION_ERROR com detalhes', async () => {
    app = await buildTestApp();
    app.post(
      '/test/validation',
      { schema: { body: z.object({ amountCents: z.number().int().nonnegative() }) } },
      () => ({ ok: true }),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/test/validation',
      payload: { amountCents: 10.5 },
    });

    expect(response.statusCode).toBe(400);
    const body = apiErrorSchema.parse(response.json());
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([
      expect.objectContaining({ path: expect.stringContaining('amountCents') as unknown }),
    ]);
  });

  it('JSON malformado → 400 no envelope padrão', async () => {
    app = await buildTestApp();
    app.post('/test/json', () => ({ ok: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/test/json',
      headers: { 'content-type': 'application/json' },
      payload: '{ invalido',
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('VALIDATION_ERROR');
  });

  it('AppError lançado por um service → status e código do erro', async () => {
    app = await buildTestApp();
    app.get('/test/app-error', () => {
      throw new NotFoundError('Conta não encontrada.');
    });

    const response = await app.inject({ method: 'GET', url: '/test/app-error' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Conta não encontrada.' },
    });
  });

  it('erro inesperado → 500 genérico sem vazar detalhes internos', async () => {
    app = await buildTestApp();
    app.get('/test/crash', () => {
      throw new Error('password=hunter2 at db.internal:5432');
    });

    const response = await app.inject({ method: 'GET', url: '/test/crash' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' },
    });
    expect(response.body).not.toContain('hunter2');
  });
});
