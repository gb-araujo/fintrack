import {
  completeRequestSchema,
  createTransactionRequestSchema,
  listTransactionsQuerySchema,
  transactionListResponseSchema,
  transactionSchema,
  updateTransactionRequestSchema,
  type Transaction,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TransactionsService } from './transactions.service.js';
import type { TransactionRecord } from './transactions.types.js';

export interface TransactionsRoutesOptions {
  transactionsService: TransactionsService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

export function toTransactionResponse(record: TransactionRecord): Transaction {
  return {
    id: record.id,
    accountId: record.accountId,
    categoryId: record.categoryId,
    type: record.type,
    amountCents: record.amountCents,
    description: record.description,
    transactionDate: record.transactionDate,
    paymentMethod: record.paymentMethod,
    status: record.status,
    recurringId: record.recurringId,
    transfer: record.transfer,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const transactionsRoutes: FastifyPluginCallbackZod<TransactionsRoutesOptions> = (
  app,
  { transactionsService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Lista lançamentos (mais recentes primeiro) com filtros e paginação por cursor',
        security,
        querystring: listTransactionsQuerySchema,
        response: { 200: transactionListResponseSchema },
      },
    },
    async (request) => {
      const page = await transactionsService.list(request.userId, request.query);
      return { items: page.items.map(toTransactionResponse), nextCursor: page.nextCursor };
    },
  );

  app.post(
    '/transactions',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Lança uma receita ou despesa',
        security,
        body: createTransactionRequestSchema,
        response: { 201: transactionSchema },
      },
    },
    async (request, reply) => {
      const record = await transactionsService.create(request.userId, request.body);
      return reply.status(201).send(toTransactionResponse(record));
    },
  );

  app.get(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Detalha um lançamento',
        security,
        params: idParams,
        response: { 200: transactionSchema },
      },
    },
    async (request) =>
      toTransactionResponse(await transactionsService.get(request.userId, request.params.id)),
  );

  app.patch(
    '/transactions/:id',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Edita um lançamento (não cancelado e que não seja perna de transferência)',
        security,
        params: idParams,
        body: updateTransactionRequestSchema,
        response: { 200: transactionSchema },
      },
    },
    async (request) =>
      toTransactionResponse(
        await transactionsService.update(request.userId, request.params.id, request.body),
      ),
  );

  app.post(
    '/transactions/:id/complete',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Efetiva um lançamento pendente (marca como pago/recebido)',
        security,
        params: idParams,
        body: completeRequestSchema.nullish(),
        response: { 200: transactionSchema },
      },
    },
    async (request) =>
      toTransactionResponse(
        await transactionsService.complete(request.userId, request.params.id, request.body ?? {}),
      ),
  );

  app.post(
    '/transactions/:id/cancel',
    {
      schema: {
        tags: ['transactions'],
        summary: 'Cancela um lançamento (não é apagado; deixa de contar)',
        security,
        params: idParams,
        response: { 200: transactionSchema },
      },
    },
    async (request) =>
      toTransactionResponse(await transactionsService.cancel(request.userId, request.params.id)),
  );

  done();
};
