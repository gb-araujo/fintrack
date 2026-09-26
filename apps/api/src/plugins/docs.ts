import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

export interface DocsPluginOptions {
  version: string;
}

/**
 * OpenAPI gerado automaticamente a partir dos schemas Zod das rotas.
 * É o contrato consumido pelo Android. UI em /docs e JSON em /docs/json.
 */
export const docsPlugin = fp<DocsPluginOptions>(
  async (app, { version }) => {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'FINTRACK API',
          description: 'API REST do FINTRACK. Valores monetários em centavos inteiros.',
          version,
        },
        components: {
          securitySchemes: {
            bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await app.register(swaggerUi, { routePrefix: '/docs' });
  },
  { name: 'docs' },
);
