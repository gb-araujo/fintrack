import {
  confirmOccurrenceRequestSchema,
  createRecurringRequestSchema,
  listOccurrencesQuerySchema,
  listRecurringQuerySchema,
  occurrenceListResponseSchema,
  occurrenceParamsSchema,
  recurringListResponseSchema,
  recurringSchema,
  transactionSchema,
  updateRecurringRequestSchema,
  type Recurring,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toTransactionResponse } from '../transactions/transactions.controller.js';
import type { RecurringRecord } from './recurring.types.js';
import type { RecurringService } from './recurring.service.js';

export interface RecurringRoutesOptions {
  recurringService: RecurringService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

export function toRecurringResponse(record: RecurringRecord, nextDate: string | null): Recurring {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    amountCents: record.amountCents,
    isVariableAmount: record.isVariableAmount,
    accountId: record.accountId,
    categoryId: record.categoryId,
    frequency: record.frequency,
    interval: record.interval,
    dayOfMonth: record.dayOfMonth,
    startDate: record.startDate,
    endDate: record.endDate,
    autoConfirm: record.autoConfirm,
    includeInForecast: record.includeInForecast,
    active: record.active,
    nextDate,
    createdAt: record.createdAt.toISOString(),
  };
}

export const recurringRoutes: FastifyPluginCallbackZod<RecurringRoutesOptions> = (
  app,
  { recurringService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/recurring',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Lista as recorrências (regras) com a próxima ocorrência não confirmada',
        security,
        querystring: listRecurringQuerySchema,
        response: { 200: recurringListResponseSchema },
      },
    },
    async (request) => {
      const items = await recurringService.list(request.userId, request.query.includeInactive);
      return { items: items.map(({ rule, nextDate }) => toRecurringResponse(rule, nextDate)) };
    },
  );

  app.get(
    '/recurring/occurrences',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Ocorrências PREVISTAS (ainda sem lançamento): atrasadas e próximas',
        security,
        querystring: listOccurrencesQuerySchema,
        response: { 200: occurrenceListResponseSchema },
      },
    },
    async (request) => {
      const result = await recurringService.occurrences(request.userId, request.query.until);
      return {
        from: result.from,
        until: result.until,
        items: result.items.map((item) => ({
          recurringId: item.recurringId,
          name: item.name,
          type: item.type,
          date: item.date,
          amountCents: item.amountCents,
          estimated: item.estimated,
          accountId: item.accountId,
          categoryId: item.categoryId,
          overdue: item.overdue,
        })),
      };
    },
  );

  app.post(
    '/recurring',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Cria uma recorrência (gera previsões; não cria lançamentos)',
        security,
        body: createRecurringRequestSchema,
        response: { 201: recurringSchema },
      },
    },
    async (request, reply) => {
      const record = await recurringService.create(request.userId, request.body);
      const { nextDate } = await recurringService.getWithNext(request.userId, record.id);
      return reply.status(201).send(toRecurringResponse(record, nextDate));
    },
  );

  app.get(
    '/recurring/:id',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Detalha uma recorrência',
        security,
        params: idParams,
        response: { 200: recurringSchema },
      },
    },
    async (request) => {
      const record = await recurringService.get(request.userId, request.params.id);
      const { nextDate } = await recurringService.getWithNext(request.userId, record.id);
      return toRecurringResponse(record, nextDate);
    },
  );

  app.patch(
    '/recurring/:id',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Edita a recorrência (vale para as próximas ocorrências)',
        security,
        params: idParams,
        body: updateRecurringRequestSchema,
        response: { 200: recurringSchema },
      },
    },
    async (request) => {
      const record = await recurringService.update(request.userId, request.params.id, request.body);
      const { nextDate } = await recurringService.getWithNext(request.userId, record.id);
      return toRecurringResponse(record, nextDate);
    },
  );

  for (const [path, active, summary] of [
    ['deactivate', false, 'Desativa a recorrência (lançamentos já confirmados permanecem)'],
    ['activate', true, 'Reativa a recorrência'],
  ] as const) {
    app.post(
      `/recurring/:id/${path}`,
      {
        schema: {
          tags: ['recurring'],
          summary,
          security,
          params: idParams,
          response: { 200: recurringSchema },
        },
      },
      async (request) => {
        const record = await recurringService.setActive(request.userId, request.params.id, active);
        return toRecurringResponse(record, null);
      },
    );
  }

  app.post(
    '/recurring/:id/occurrences/:date/confirm',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Confirma a ocorrência: cria o lançamento efetivado vinculado a ela',
        security,
        params: occurrenceParamsSchema,
        body: confirmOccurrenceRequestSchema.nullish(),
        response: { 201: transactionSchema },
      },
    },
    async (request, reply) => {
      const record = await recurringService.confirm(
        request.userId,
        request.params.id,
        request.params.date,
        request.body ?? {},
      );
      return reply.status(201).send(toTransactionResponse(record));
    },
  );

  app.post(
    '/recurring/:id/occurrences/:date/skip',
    {
      schema: {
        tags: ['recurring'],
        summary: 'Pula a ocorrência (não conta em saldo, relatórios nem previsões)',
        security,
        params: occurrenceParamsSchema,
        response: { 201: transactionSchema },
      },
    },
    async (request, reply) => {
      const record = await recurringService.skip(
        request.userId,
        request.params.id,
        request.params.date,
      );
      return reply.status(201).send(toTransactionResponse(record));
    },
  );

  done();
};
