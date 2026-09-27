import {
  budgetListResponseSchema,
  budgetSchema,
  listBudgetsQuerySchema,
  upsertBudgetRequestSchema,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { BudgetsService } from './budgets.service.js';

export interface BudgetsRoutesOptions {
  budgetsService: BudgetsService;
}

const security = [{ bearerAuth: [] }];

export const budgetsRoutes: FastifyPluginCallbackZod<BudgetsRoutesOptions> = (
  app,
  { budgetsService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/budgets',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Orçamentos do mês: limite, gasto, restante e percentual (calculados no backend)',
        security,
        querystring: listBudgetsQuerySchema,
        response: { 200: budgetListResponseSchema },
      },
    },
    async (request) => budgetsService.list(request.userId, request.query.month),
  );

  app.put(
    '/budgets',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Define ou altera o limite mensal de uma categoria de despesa',
        security,
        body: upsertBudgetRequestSchema,
        response: { 200: budgetSchema },
      },
    },
    async (request) => budgetsService.upsert(request.userId, request.body),
  );

  app.delete(
    '/budgets/:id',
    {
      schema: {
        tags: ['budgets'],
        summary: 'Remove um orçamento (configuração; não afeta lançamentos)',
        security,
        params: z.object({ id: z.uuid() }),
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await budgetsService.remove(request.userId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  done();
};
