import { apiErrorSchema } from '@fintrack/shared';
import type { z } from 'zod';
import { env } from '../lib/env';

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
}

/**
 * Cliente HTTP da web. Todas as chamadas à API passam por aqui.
 * A partir da FASE 1 recebe o access token e o refresh automático em 401.
 */
export async function apiRequest<TSchema extends z.ZodType>(
  path: string,
  {
    schema,
    body,
    baseUrl = env.VITE_API_URL,
    acceptStatuses = [],
    headers,
    ...init
  }: RequestOptions<TSchema>,
): Promise<z.infer<TSchema>> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Não foi possível conectar à API.', cause);
  }

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
