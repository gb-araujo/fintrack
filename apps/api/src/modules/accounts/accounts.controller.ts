import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  accountListResponseSchema,
  accountSchema,
  createAccountRequestSchema,
  listAccountsQuerySchema,
  toAccountResponse,
  updateAccountRequestSchema,
} from './accounts.schema.js';
import type { AccountsService } from './accounts.service.js';

export interface AccountsRoutesOptions {
  accountsService: AccountsService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

export const accountsRoutes: FastifyPluginCallbackZod<AccountsRoutesOptions> = (
  app,
  { accountsService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.get(
    '/accounts',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Lista as contas com o saldo atual calculado',
        security,
        querystring: listAccountsQuerySchema,
        response: { 200: accountListResponseSchema },
      },
    },
    async (request) => {
      const accounts = await accountsService.list(request.userId, request.query.includeArchived);
      return { items: accounts.map(toAccountResponse) };
    },
  );

  app.post(
    '/accounts',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Cria uma conta',
        security,
        body: createAccountRequestSchema,
        response: { 201: accountSchema },
      },
    },
    async (request, reply) => {
      const account = await accountsService.create(request.userId, request.body);
      return reply.status(201).send(toAccountResponse(account));
    },
  );

  app.get(
    '/accounts/:id',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Detalha uma conta',
        security,
        params: idParams,
        response: { 200: accountSchema },
      },
    },
    async (request) =>
      toAccountResponse(await accountsService.get(request.userId, request.params.id)),
  );

  app.patch(
    '/accounts/:id',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Atualiza nome, saldo inicial ou participação no dinheiro disponível',
        security,
        params: idParams,
        body: updateAccountRequestSchema,
        response: { 200: accountSchema },
      },
    },
    async (request) =>
      toAccountResponse(
        await accountsService.update(request.userId, request.params.id, request.body),
      ),
  );

  app.post(
    '/accounts/:id/archive',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Arquiva a conta (o histórico é preservado)',
        security,
        params: idParams,
        response: { 200: accountSchema },
      },
    },
    async (request) =>
      toAccountResponse(await accountsService.archive(request.userId, request.params.id)),
  );

  app.post(
    '/accounts/:id/unarchive',
    {
      schema: {
        tags: ['accounts'],
        summary: 'Reativa uma conta arquivada',
        security,
        params: idParams,
        response: { 200: accountSchema },
      },
    },
    async (request) =>
      toAccountResponse(await accountsService.unarchive(request.userId, request.params.id)),
  );

  done();
};
