import {
  createCreditCardRequestSchema,
  createPurchaseRequestSchema,
  creditCardListResponseSchema,
  creditCardSchema,
  invoiceDetailSchema,
  invoiceListResponseSchema,
  listCreditCardsQuerySchema,
  payableInvoiceListResponseSchema,
  payInvoiceRequestSchema,
  purchaseListResponseSchema,
  purchaseSchema,
  transactionSchema,
  updateCreditCardRequestSchema,
  updatePurchaseRequestSchema,
  type CreditCard,
  type InvoiceSummary,
  type Purchase,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toTransactionResponse } from '../transactions/transactions.controller.js';
import type { CardRecord, PurchaseRecord } from './credit-cards.types.js';
import type { CardView, CreditCardsService, InvoiceView } from './credit-cards.service.js';

export interface CreditCardsRoutesOptions {
  creditCardsService: CreditCardsService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

/** "2026-10-01" → "2026-10". */
const month = (referenceMonth: string) => referenceMonth.slice(0, 7);

export function toInvoiceSummary(invoice: InvoiceView): InvoiceSummary {
  return {
    id: invoice.id,
    creditCardId: invoice.creditCardId,
    referenceMonth: month(invoice.referenceMonth),
    closingDate: invoice.closingDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    overdue: invoice.overdue,
    totalCents: invoice.totalCents,
    paidCents: invoice.paidCents,
    scheduledCents: invoice.scheduledCents,
    remainingCents: invoice.remainingCents,
  };
}

function toCardBase(card: CardRecord) {
  return {
    id: card.id,
    name: card.name,
    limitCents: card.limitCents,
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    paymentAccountId: card.paymentAccountId,
    archivedAt: card.archivedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

export function toCardResponse(card: CardView): CreditCard {
  return {
    ...toCardBase(card),
    usedLimitCents: card.usedLimitCents,
    availableLimitCents: card.availableLimitCents,
    openInvoice: card.openInvoice ? toInvoiceSummary(card.openInvoice) : null,
  };
}

function toPurchaseResponse(purchase: PurchaseRecord): Purchase {
  return {
    id: purchase.id,
    creditCardId: purchase.creditCardId,
    description: purchase.description,
    purchaseDate: purchase.purchaseDate,
    totalAmountCents: purchase.totalAmountCents,
    installmentsCount: purchase.installmentsCount,
    categoryId: purchase.categoryId,
    cancelled: purchase.cancelledAt !== null,
    installments: purchase.installments.map((item) => ({
      installmentNumber: item.installmentNumber,
      amountCents: item.amountCents,
      invoiceId: item.invoiceId,
      referenceMonth: month(item.referenceMonth),
      dueDate: item.dueDate,
    })),
    createdAt: purchase.createdAt.toISOString(),
  };
}

export const creditCardsRoutes: FastifyPluginCallbackZod<CreditCardsRoutesOptions> = (
  app,
  { creditCardsService: service },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  // ---------- Cartões ----------

  app.get(
    '/credit-cards',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Lista os cartões com limite usado/disponível e a fatura aberta',
        security,
        querystring: listCreditCardsQuerySchema,
        response: { 200: creditCardListResponseSchema },
      },
    },
    async (request) => {
      const items = await service.list(request.userId, request.query.includeArchived);
      return { items: items.map(toCardResponse) };
    },
  );

  app.post(
    '/credit-cards',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Cadastra um cartão de crédito',
        security,
        body: createCreditCardRequestSchema,
        response: { 201: creditCardSchema },
      },
    },
    async (request, reply) => {
      const card = await service.create(request.userId, request.body);
      return reply.status(201).send(toCardResponse(await service.get(request.userId, card.id)));
    },
  );

  app.get(
    '/credit-cards/:id',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Detalha um cartão',
        security,
        params: idParams,
        response: { 200: creditCardSchema },
      },
    },
    async (request) => toCardResponse(await service.get(request.userId, request.params.id)),
  );

  app.patch(
    '/credit-cards/:id',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Edita o cartão (fechamento/vencimento novos valem só para faturas futuras)',
        security,
        params: idParams,
        body: updateCreditCardRequestSchema,
        response: { 200: creditCardSchema },
      },
    },
    async (request) => {
      await service.update(request.userId, request.params.id, request.body);
      return toCardResponse(await service.get(request.userId, request.params.id));
    },
  );

  for (const [path, archived, summary] of [
    ['archive', true, 'Arquiva o cartão (novas compras bloqueadas; faturas em aberto continuam)'],
    ['unarchive', false, 'Reativa o cartão'],
  ] as const) {
    app.post(
      `/credit-cards/:id/${path}`,
      {
        schema: {
          tags: ['credit-cards'],
          summary,
          security,
          params: idParams,
          response: { 200: creditCardSchema },
        },
      },
      async (request) => {
        await service.setArchived(request.userId, request.params.id, archived);
        return toCardResponse(await service.get(request.userId, request.params.id));
      },
    );
  }

  // ---------- Compras ----------

  app.post(
    '/credit-cards/:id/purchases',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Lança uma compra no cartão (gera as parcelas nas faturas correspondentes)',
        security,
        params: idParams,
        body: createPurchaseRequestSchema,
        response: { 201: purchaseSchema },
      },
    },
    async (request, reply) => {
      const purchase = await service.createPurchase(
        request.userId,
        request.params.id,
        request.body,
      );
      return reply.status(201).send(toPurchaseResponse(purchase));
    },
  );

  app.get(
    '/credit-cards/:id/purchases',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Compras do cartão (mais recentes primeiro), com as parcelas',
        security,
        params: idParams,
        response: { 200: purchaseListResponseSchema },
      },
    },
    async (request) => {
      const items = await service.listPurchases(request.userId, request.params.id);
      return { items: items.map(toPurchaseResponse) };
    },
  );

  app.get(
    '/purchases/:id',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Detalha uma compra no cartão',
        security,
        params: idParams,
        response: { 200: purchaseSchema },
      },
    },
    async (request) =>
      toPurchaseResponse(await service.getPurchase(request.userId, request.params.id)),
  );

  app.patch(
    '/purchases/:id',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Altera descrição/categoria da compra (valor, data e parcelas não mudam)',
        security,
        params: idParams,
        body: updatePurchaseRequestSchema,
        response: { 200: purchaseSchema },
      },
    },
    async (request) =>
      toPurchaseResponse(
        await service.updatePurchase(request.userId, request.params.id, request.body),
      ),
  );

  app.post(
    '/purchases/:id/cancel',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Cancela a compra (estorno): as parcelas saem de fatura, limite e orçamento',
        security,
        params: idParams,
        response: { 200: purchaseSchema },
      },
    },
    async (request) =>
      toPurchaseResponse(await service.cancelPurchase(request.userId, request.params.id)),
  );

  // ---------- Faturas ----------

  app.get(
    '/credit-cards/:id/invoices',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Faturas do cartão (mais recentes primeiro)',
        security,
        params: idParams,
        response: { 200: invoiceListResponseSchema },
      },
    },
    async (request) => {
      const items = await service.listInvoices(request.userId, request.params.id);
      return { items: items.map(toInvoiceSummary) };
    },
  );

  app.get(
    '/invoices/payable',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Faturas com valor a pagar, de todos os cartões (por vencimento)',
        security,
        response: { 200: payableInvoiceListResponseSchema },
      },
    },
    async (request) => {
      const items = await service.listPayableInvoices(request.userId);
      return {
        items: items.map((invoice) => ({
          ...toInvoiceSummary(invoice),
          cardName: invoice.cardName,
          payableCents: Math.max(
            0,
            invoice.totalCents - invoice.paidCents - invoice.scheduledCents,
          ),
        })),
      };
    },
  );

  app.get(
    '/invoices/:id',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Fatura com as parcelas que a compõem e os pagamentos',
        security,
        params: idParams,
        response: { 200: invoiceDetailSchema },
      },
    },
    async (request) => {
      const detail = await service.getInvoice(request.userId, request.params.id);
      return {
        ...toInvoiceSummary(detail.invoice),
        cardName: detail.cardName,
        installments: detail.installments,
        payments: detail.payments,
      };
    },
  );

  app.post(
    '/invoices/:id/payments',
    {
      schema: {
        tags: ['credit-cards'],
        summary: 'Paga (ou agenda) a fatura a partir de uma conta: `card_payment`, não é despesa',
        security,
        params: idParams,
        body: payInvoiceRequestSchema,
        response: { 201: transactionSchema },
      },
    },
    async (request, reply) => {
      const payment = await service.payInvoice(request.userId, request.params.id, request.body);
      return reply.status(201).send(toTransactionResponse(payment));
    },
  );

  done();
};
