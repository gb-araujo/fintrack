import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { AppConfig } from './config/env.js';
import type { DatabaseConnection } from './db/client.js';
import { authRoutes } from './modules/auth/auth.controller.js';
import { AuthService } from './modules/auth/auth.service.js';
import { DrizzleRefreshTokensRepository } from './modules/auth/refresh-tokens.repository.js';
import { healthRoutes } from './modules/health/health.controller.js';
import { HealthService } from './modules/health/health.service.js';
import { usersRoutes } from './modules/users/users.controller.js';
import { DrizzleUsersRepository } from './modules/users/users.repository.js';
import { UsersService } from './modules/users/users.service.js';
import { authPlugin } from './plugins/auth.js';
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
  await app.register(authPlugin, { config });
  if (config.API_DOCS_ENABLED) {
    await app.register(docsPlugin, { version: config.APP_VERSION });
  }

  if (config.JWT_SECRET_EPHEMERAL) {
    app.log.warn(
      'JWT_SECRET não definido: usando segredo temporário (sessões caem a cada restart).',
    );
  }

  // Composição: repositórios → services → rotas.
  const usersRepository = new DrizzleUsersRepository(database.db);
  const refreshTokensRepository = new DrizzleRefreshTokensRepository(database.db);
  const authService = new AuthService(
    usersRepository,
    refreshTokensRepository,
    app.accessTokenSigner,
    {
      refreshTokenTtlDays: config.REFRESH_TOKEN_TTL_DAYS,
      onSecurityEvent: (event) => {
        if (event.type === 'refresh_token_reuse') {
          app.log.warn(
            { userId: event.userId, familyId: event.familyId },
            'reuso de refresh token detectado: sessão revogada',
          );
        }
      },
    },
  );
  const usersService = new UsersService(usersRepository);

  await app.register(healthRoutes, {
    healthService: new HealthService(database, { version: config.APP_VERSION }),
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes, { authService, config });
      await api.register(usersRoutes, { usersService });
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
