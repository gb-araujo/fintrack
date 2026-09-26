import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { healthResponseSchema } from './health.schema.js';
import type { HealthService } from './health.service.js';

export interface HealthRoutesOptions {
  healthService: HealthService;
}

/**
 * GET /health — pública, sem rate limit (usada pelo healthcheck do Railway).
 * 200 quando tudo está ok; 503 (mesmo corpo) quando alguma dependência falhou.
 */
export const healthRoutes: FastifyPluginCallbackZod<HealthRoutesOptions> = (
  app,
  { healthService },
  done,
) => {
  app.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Status da API e de suas dependências',
        response: { 200: healthResponseSchema, 503: healthResponseSchema },
      },
      config: { rateLimit: false },
    },
    async (request, reply) => {
      const health = await healthService.check();
      if (health.status !== 'ok') {
        request.log.warn({ checks: health.checks }, 'healthcheck degradado');
        return reply.status(503).send(health);
      }
      return reply.status(200).send(health);
    },
  );
  done();
};
