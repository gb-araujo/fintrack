import {
  authResponseSchema,
  REFRESH_RACE_REASON,
  userSchema,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
  type User,
} from '@fintrack/shared';
import { z } from 'zod';
import { session } from '../lib/session';
import { ApiError, apiRequest, setRefreshHandler } from './http';

const AUTH = '/api/v1/auth';

function startSession(response: AuthResponse): User {
  session.setAccessToken(response.accessToken);
  return response.user;
}

export async function login(input: LoginRequest): Promise<User> {
  const response = await apiRequest(`${AUTH}/login`, {
    schema: authResponseSchema,
    method: 'POST',
    body: input,
    auth: false,
  });
  return startSession(response);
}

export async function register(input: RegisterRequest): Promise<User> {
  const response = await apiRequest(`${AUTH}/register`, {
    schema: authResponseSchema,
    method: 'POST',
    body: input,
    auth: false,
  });
  return startSession(response);
}

export async function logout(): Promise<void> {
  try {
    await apiRequest(`${AUTH}/logout`, { schema: z.undefined(), method: 'POST', auth: false });
  } finally {
    // Mesmo se a API estiver fora, a sessão local é encerrada.
    session.setAccessToken(null);
  }
}

export function fetchMe(): Promise<User> {
  return apiRequest('/api/v1/users/me', { schema: userSchema, method: 'GET' });
}

const RACE_RETRY_DELAY_MS = 250;

function isConcurrentRotation(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 401) return false;
  const details = error.details as { reason?: unknown } | undefined;
  return details?.reason === REFRESH_RACE_REASON;
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestRefresh(): Promise<AuthResponse> {
  return apiRequest(`${AUTH}/refresh`, { schema: authResponseSchema, method: 'POST', auth: false });
}

let inFlight: Promise<User | null> | undefined;

/**
 * Renova a sessão usando o cookie httpOnly do refresh token.
 * - Single-flight: chamadas simultâneas compartilham a mesma requisição (o token é rotacionado
 *   a cada uso; duas renovações paralelas na mesma aba derrubariam uma à outra).
 * - Se outra aba rotacionou o token no mesmo instante, a API responde 401 com
 *   reason=concurrent_rotation; como o cookie já foi atualizado pela outra aba, uma segunda
 *   tentativa resolve. Qualquer outro 401 significa "sem sessão" (sem nova tentativa).
 */
export function refreshSession(): Promise<User | null> {
  inFlight ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return startSession(await requestRefresh());
        } catch (error) {
          if (!isConcurrentRotation(error) || attempt === 1) throw error;
          await wait(RACE_RETRY_DELAY_MS);
        }
      }
      return null;
    } catch {
      session.setAccessToken(null);
      return null;
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
}

setRefreshHandler(async () => (await refreshSession()) !== null);
