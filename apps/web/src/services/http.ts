import { apiErrorSchema } from '@fintrack/shared';
import type { z } from 'zod';
import { env } from '../lib/env';
import { session } from '../lib/session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions<TSchema extends z.ZodType> extends Omit<RequestInit, 'body'> {
  /** Schema Zod usado para validar a resposta — a web nunca confia cegamente no formato recebido. */
  schema: TSchema;
  body?: unknown;
  baseUrl?: string;
  /** Status HTTP não-2xx cujo corpo segue o schema de sucesso (ex.: 503 do /health degradado). */
  acceptStatuses?: readonly number[];
  /** Envia o access token e renova a sessão em 401. Padrão: true. */
  auth?: boolean;
}

/** Renovação de sessão registrada pelo módulo de auth (evita dependência circular). */
type RefreshHandler = () => Promise<boolean>;
let refreshHandler: RefreshHandler | undefined;

export function setRefreshHandler(handler: RefreshHandler | undefined): void {
  refreshHandler = handler;
}

/** Resposta 204/sem conteúdo. */
export const noContent = undefined;

async function send(
  path: string,
  {
    body,
    baseUrl = env.VITE_API_URL,
    headers,
    auth,
    ...init
  }: Omit<RequestOptions<z.ZodType>, 'schema' | 'acceptStatuses'>,
): Promise<Response> {
  const token = auth ? session.getAccessToken() : null;
  try {
    return await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API.', cause);
  }
}

/**
 * Cliente HTTP da web. Todas as chamadas à API passam por aqui.
 * Em 401 de uma rota autenticada, renova a sessão uma única vez e repete a requisição.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  { schema, acceptStatuses = [], auth = true, ...options }: RequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  let response = await send(path, { ...options, auth });

  if (response.status === 401 && auth && refreshHandler) {
    const renewed = await refreshHandler();
    if (renewed) {
      response = await send(path, { ...options, auth });
    } else {
      session.expire();
    }
  }

  if (response.status === 204) return schema.parse(noContent);

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    const parsedError = apiErrorSchema.safeParse(payload);
    if (parsedError.success) {
      const { code, message, details } = parsedError.data.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'HTTP_ERROR', `Erro ${response.status} ao chamar a API.`);
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      response.status,
      'INVALID_RESPONSE',
      'Resposta da API em formato inesperado.',
      parsed.error.issues,
    );
  }
  return parsed.data;
}
