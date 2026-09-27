import {
  investmentListResponseSchema,
  investmentSummarySchema,
  investmentValuationSchema,
  updateInvestmentDetailsRequestSchema,
  upsertValuationRequestSchema,
  valuationListResponseSchema,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { InvestmentsService } from './investments.service.js';

export interface InvestmentsRoutesOptions {
  investmentsService: InvestmentsService;
}

const security = [{ bearerAuth: [] }];
const accountParams = z.object({ accountId: z.uuid() });
const valuationParams = z.object({ accountId: z.uuid(), id: z.uuid() });

export const investmentsRoutes: FastifyPluginCallbackZod<InvestmentsRoutesOptions> = (
  app,
  { investmentsService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/investments',
    {
      schema: {
        tags: ['investments'],
        summary: 'Lista as contas de investimento com saldo e rendimento desde a primeira avaliação',
        security,
        response: { 200: investmentListResponseSchema },
      },
    },
    async (request) => ({ items: await investmentsService.listSummaries(request.userId) }),
  );

  app.patch(
    '/investments/:accountId',
    {
      schema: {
        tags: ['investments'],
        summary: 'Atualiza instituição e/ou produto de uma conta de investimento',
        security,
        params: accountParams,
        body: updateInvestmentDetailsRequestSchema,
        response: { 200: investmentSummarySchema },
      },
    },
    async (request) =>
      investmentsService.updateDetails(request.userId, request.params.accountId, request.body),
  );

  app.get(
    '/investments/:accountId/valuations',
    {
      schema: {
        tags: ['investments'],
        summary: 'Histórico de avaliações (nunca sobrescrito) com rendimento derivado entre cada par',
        security,
        params: accountParams,
        response: { 200: valuationListResponseSchema },
      },
    },
    async (request) => ({
      items: await investmentsService.listValuations(request.userId, request.params.accountId),
    }),
  );

  app.put(
    '/investments/:accountId/valuations',
    {
      schema: {
        tags: ['investments'],
        summary: 'Registra (ou corrige) a avaliação da conta numa data — nunca apaga as demais',
        security,
        params: accountParams,
        body: upsertValuationRequestSchema,
        response: { 200: investmentValuationSchema },
      },
    },
    async (request) =>
      investmentsService.upsertValuation(request.userId, request.params.accountId, request.body),
  );

  app.delete(
    '/investments/:accountId/valuations/:id',
    {
      schema: {
        tags: ['investments'],
        summary: 'Remove uma avaliação do histórico',
        security,
        params: valuationParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await investmentsService.deleteValuation(
        request.userId,
        request.params.accountId,
        request.params.id,
      );
      return reply.status(204).send(null);
    },
  );

  done();
};
