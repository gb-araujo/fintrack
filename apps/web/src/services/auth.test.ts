import { describe, expect, it, vi } from 'vitest';
import { session } from '../lib/session';
import { authResponse, errorResponse, jsonResponse, mockApi, testUser } from '../test/render';
import { login, logout, refreshSession } from './auth';

describe('serviço de autenticação (web)', () => {
  it('login guarda o access token apenas em memória e não envia token antigo', async () => {
    session.setAccessToken('antigo');
    const fetchMock = mockApi({
      'POST /api/v1/auth/login': () => jsonResponse(authResponse('token-login')),
    });

    await expect(login({ email: 'a@b.com', password: 'x' })).resolves.toEqual(testUser);

    expect(session.getAccessToken()).toBe('token-login');
    const init = fetchMock.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init.credentials).toBe('include');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('refreshSession é single-flight: chamadas simultâneas fazem UMA requisição', async () => {
    const fetchMock = mockApi({
      'POST /api/v1/auth/refresh': () => jsonResponse(authResponse('renovado')),
    });

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(results).toEqual([testUser, testUser, testUser]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe('renovado');
  });

  it('401 por corrida entre abas: tenta de novo uma vez (cookie já atualizado)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const responses = [
      errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida', { reason: 'concurrent_rotation' }),
      jsonResponse(authResponse('da-outra-aba')),
    ];
    const fetchMock = mockApi({ 'POST /api/v1/auth/refresh': () => responses.shift()! });

    await expect(refreshSession()).resolves.toEqual(testUser);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sem sessão válida retorna null e limpa o token', async () => {
    session.setAccessToken('velho');
    const fetchMock = mockApi({
      'POST /api/v1/auth/refresh': () => errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida'),
    });

    await expect(refreshSession()).resolves.toBeNull();
    expect(session.getAccessToken()).toBeNull();
    // 401 comum = sem sessão: nenhuma nova tentativa.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logout limpa a sessão local mesmo se a API estiver fora', async () => {
    session.setAccessToken('token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));

    await expect(logout()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(session.getAccessToken()).toBeNull();
  });
});
