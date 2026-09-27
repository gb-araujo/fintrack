import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { session } from '../lib/session';
import { jsonResponse } from '../test/render';
import { ApiError, apiRequest, setRefreshHandler } from './http';

const schema = z.object({ value: z.number() });

afterEach(() => {
  setRefreshHandler(undefined);
});

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

describe('apiRequest — autenticação', () => {
  const headersOf = (fetchMock: ReturnType<typeof vi.fn>, call: number) =>
    (fetchMock.mock.calls[call]![1] as RequestInit).headers as Record<string, string>;

  it('envia o access token em memória como Bearer', async () => {
    session.setAccessToken('token-a');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/x', { schema });
    expect(headersOf(fetchMock, 0).Authorization).toBe('Bearer token-a');
  });

  it('rotas públicas (auth: false) não enviam o token', async () => {
    session.setAccessToken('token-a');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ value: 1 }));
    vi.stubGlobal('fetch', fetchMock);

    await apiRequest('/x', { schema, auth: false });
    expect(headersOf(fetchMock, 0).Authorization).toBeUndefined();
  });

  it('em 401 renova a sessão uma vez e repete a requisição com o novo token', async () => {
    session.setAccessToken('expirado');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ value: 7 }));
    vi.stubGlobal('fetch', fetchMock);
    const refresh = vi.fn(() => {
      session.setAccessToken('novo');
      return Promise.resolve(true);
    });
    setRefreshHandler(refresh);

    await expect(apiRequest('/x', { schema })).resolves.toEqual({ value: 7 });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(headersOf(fetchMock, 1).Authorization).toBe('Bearer novo');
  });

  it('se a renovação falhar, expira a sessão e propaga o 401 (sem loop)', async () => {
    session.setAccessToken('expirado');
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401));
    vi.stubGlobal('fetch', fetchMock);
    setRefreshHandler(() => Promise.resolve(false));
    const expired = vi.fn();
    const unsubscribe = session.onExpired(expired);

    await expect(apiRequest('/x', { schema })).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBeNull();
    unsubscribe();
  });
});
