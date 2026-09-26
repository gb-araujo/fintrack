import type { FastifyServerOptions } from 'fastify';
import type { AppConfig } from '../config/env.js';

/**
 * Caminhos que nunca devem aparecer em logs: credenciais e dados financeiros.
 * Regra geral: logar ids e metadados técnicos, nunca valores, descrições ou tokens.
 */
export const SENSITIVE_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.amount',
  '*.amountCents',
  '*.balance',
  '*.balanceCents',
  '*.limitCents',
  '*.description',
  '*.email',
  '*.DATABASE_URL',
  '*.JWT_SECRET',
];

interface RequestLike {
  method: string;
  url: string;
  id: string;
}

export function buildLoggerOptions(config: AppConfig): FastifyServerOptions['logger'] {
  if (config.NODE_ENV === 'test') return false;

  return {
    level: config.LOG_LEVEL,
    redact: { paths: SENSITIVE_LOG_PATHS, censor: '[REDACTED]' },
    serializers: {
      // Remove a query string: filtros de busca podem conter descrições/valores.
      req: (req: RequestLike) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
    },
    ...(config.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
          },
        }
      : {}),
  };
}
