import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { jsonResponse } from '../test/render';
import { ApiError, apiRequest } from './http';

const schema = z.object({ value: z.number() });

describe('apiRequest', () => {
  it('retorna o corpo validado pelo schema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 42 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiRequest('/x', { schema, baseUrl: 'http://api' })).resolves.toEqual({
      value: 42,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/x',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('converte o envelope de erro padrão em ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado' } }, 404),
        ),
    );

    const error = await apiRequest('/x', { schema }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado',
    });
  });

  it('rejeita resposta fora do contrato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ value: 'texto' })));

    await expect(apiRequest('/x', { schema })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('sinaliza falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(apiRequest('/x', { schema })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('serializa o corpo como JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/x', { schema, method: 'POST', body: { a: 1 } });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});
