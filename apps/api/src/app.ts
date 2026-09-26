import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import type { DatabaseConnection } from './db/client.js';
import { healthRoutes } from './modules/health/health.controller.js';
import { HealthService } from './modules/health/health.service.js';
import { docsPlugin } from './plugins/docs.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { buildLoggerOptions } from './plugins/logger.js';
import { securityPlugin } from './plugins/security.js';

export interface AppDependencies {
  config: AppConfig;
  database: DatabaseConnection;
}

/**
 * Monta a aplicação Fastify sem abrir porta — usado pelo server.ts e pelos testes (app.inject).
 * Dependências (config, banco) são injetadas para permitir testes sem PostgreSQL.
 */
export async function buildApp({ config, database }: AppDependencies) {
  const app = Fastify({
    logger: buildLoggerOptions(config),
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1_048_576,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.addHook('onSend', async (request, reply) => {
    void reply.header('x-request-id', request.id);
  });

  await app.register(errorHandlerPlugin);
  await app.register(securityPlugin, { config });
  if (config.API_DOCS_ENABLED) {
    await app.register(docsPlugin, { version: config.APP_VERSION });
  }

  await app.register(healthRoutes, {
    healthService: new HealthService(database, { version: config.APP_VERSION }),
  });

  await app.register(
    async (_api) => {
      // Módulos de domínio são registrados aqui a partir da FASE 1 (auth, accounts, …).
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
