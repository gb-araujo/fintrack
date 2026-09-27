import {
  completeRequestSchema,
  createTransferRequestSchema,
  transferSchema,
  updateTransferRequestSchema,
  type Transfer,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { TransfersService } from './transfers.service.js';
import type { TransferRecord } from './transfers.types.js';

export interface TransfersRoutesOptions {
  transfersService: TransfersService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

export function toTransferResponse(record: TransferRecord): Transfer {
  return {
    id: record.id,
    fromAccountId: record.fromAccountId,
    toAccountId: record.toAccountId,
    amountCents: record.amountCents,
    transferDate: record.transferDate,
    status: record.status,
    description: record.description,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export const transfersRoutes: FastifyPluginCallbackZod<TransfersRoutesOptions> = (
  app,
  { transfersService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/transfers',
    {
      schema: {
        tags: ['transfers'],
        summary: 'Transfere entre duas contas (não é receita nem despesa)',
        security,
        body: createTransferRequestSchema,
        response: { 201: transferSchema },
      },
    },
    async (request, reply) => {
      const transfer = await transfersService.create(request.userId, request.body);
      return reply.status(201).send(toTransferResponse(transfer));
    },
  );

  app.get(
    '/transfers/:id',
    {
      schema: {
        tags: ['transfers'],
        summary: 'Detalha uma transferência',
        security,
        params: idParams,
        response: { 200: transferSchema },
      },
    },
    async (request) =>
      toTransferResponse(await transfersService.get(request.userId, request.params.id)),
  );

  app.patch(
    '/transfers/:id',
    {
      schema: {
        tags: ['transfers'],
        summary: 'Edita a transferência (as duas pernas mudam juntas)',
        security,
        params: idParams,
        body: updateTransferRequestSchema,
        response: { 200: transferSchema },
      },
    },
    async (request) =>
      toTransferResponse(
        await transfersService.update(request.userId, request.params.id, request.body),
      ),
  );

  app.post(
    '/transfers/:id/complete',
    {
      schema: {
        tags: ['transfers'],
        summary: 'Efetiva uma transferência pendente',
        security,
        params: idParams,
        body: completeRequestSchema.nullish(),
        response: { 200: transferSchema },
      },
    },
    async (request) =>
      toTransferResponse(
        await transfersService.complete(request.userId, request.params.id, request.body ?? {}),
      ),
  );

  app.post(
    '/transfers/:id/cancel',
    {
      schema: {
        tags: ['transfers'],
        summary: 'Cancela a transferência (as duas pernas; nada é apagado)',
        security,
        params: idParams,
        response: { 200: transferSchema },
      },
    },
    async (request) =>
      toTransferResponse(await transfersService.cancel(request.userId, request.params.id)),
  );

  done();
};
