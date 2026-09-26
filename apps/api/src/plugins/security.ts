import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { API_ERROR_CODES } from '@fintrack/shared';
import fp from 'fastify-plugin';
import type { AppConfig } from '../config/env.js';
import { AppError } from '../shared/errors/index.js';

export interface SecurityPluginOptions {
  config: AppConfig;
}

/**
 * Cabeçalhos de segurança, CORS restrito às origens configuradas e rate limiting global.
 * Rotas específicas (ex.: /auth/login na FASE 1) podem definir limites mais rígidos via
 * `config: { rateLimit: { max, timeWindow } }`.
 */
export const securityPlugin = fp<SecurityPluginOptions>(
  async (app, { config }) => {
    await app.register(helmet, {
      // A API só responde JSON. Com a documentação ligada (dev), o Swagger UI precisa de scripts inline.
      contentSecurityPolicy: config.API_DOCS_ENABLED
        ? false
        : {
            useDefaults: false,
            directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
          },
    });

    await app.register(cors, {
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    });

    await app.register(rateLimit, {
      global: true,
      max: config.RATE_LIMIT_MAX,
      timeWindow: config.RATE_LIMIT_WINDOW,
      errorResponseBuilder: (_request, context) =>
        new AppError(
          429,
          API_ERROR_CODES.RATE_LIMITED,
          'Muitas requisições. Tente novamente em instantes.',
          { retryAfterSeconds: Math.ceil(context.ttl / 1000) },
        ),
    });
  },
  { name: 'security' },
);
