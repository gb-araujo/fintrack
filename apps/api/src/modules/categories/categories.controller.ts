import {
  categoryListResponseSchema,
  categorySchema,
  createCategoryRequestSchema,
  listCategoriesQuerySchema,
  updateCategoryRequestSchema,
  type Category,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CategoriesService } from './categories.service.js';
import type { CategoryRecord } from './categories.types.js';

export interface CategoriesRoutesOptions {
  categoriesService: CategoriesService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

export function toCategoryResponse(category: CategoryRecord): Category {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    isDefault: category.isDefault,
    archivedAt: category.archivedAt?.toISOString() ?? null,
    createdAt: category.createdAt.toISOString(),
  };
}

export const categoriesRoutes: FastifyPluginCallbackZod<CategoriesRoutesOptions> = (
  app,
  { categoriesService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/categories',
    {
      schema: {
        tags: ['categories'],
        summary: 'Lista as categorias (padrão e personalizadas)',
        security,
        querystring: listCategoriesQuerySchema,
        response: { 200: categoryListResponseSchema },
      },
    },
    async (request) => {
      const categories = await categoriesService.list(request.userId, request.query);
      return { items: categories.map(toCategoryResponse) };
    },
  );

  app.post(
    '/categories',
    {
      schema: {
        tags: ['categories'],
        summary: 'Cria uma categoria personalizada',
        security,
        body: createCategoryRequestSchema,
        response: { 201: categorySchema },
      },
    },
    async (request, reply) => {
      const category = await categoriesService.create(request.userId, request.body);
      return reply.status(201).send(toCategoryResponse(category));
    },
  );

  app.patch(
    '/categories/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Renomeia a categoria',
        security,
        params: idParams,
        body: updateCategoryRequestSchema,
        response: { 200: categorySchema },
      },
    },
    async (request) =>
      toCategoryResponse(
        await categoriesService.rename(request.userId, request.params.id, request.body.name),
      ),
  );

  app.post(
    '/categories/:id/archive',
    {
      schema: {
        tags: ['categories'],
        summary: 'Arquiva a categoria (lançamentos antigos são preservados)',
        security,
        params: idParams,
        response: { 200: categorySchema },
      },
    },
    async (request) =>
      toCategoryResponse(await categoriesService.archive(request.userId, request.params.id)),
  );

  app.post(
    '/categories/:id/unarchive',
    {
      schema: {
        tags: ['categories'],
        summary: 'Reativa uma categoria arquivada',
        security,
        params: idParams,
        response: { 200: categorySchema },
      },
    },
    async (request) =>
      toCategoryResponse(await categoriesService.unarchive(request.userId, request.params.id)),
  );

  done();
};
