import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { positiveCentsSchema, signedCentsSchema } from '../money/money.js';
import { monthSchema } from './budgets.js';
import { descriptionSchema } from './transactions.js';

/**
 * Cartão de crédito (docs/financial-rules.md §3, ADR 0004/0005/0017). O cartão NÃO é uma conta:
 * compras viram parcelas em faturas; a fatura é paga por uma conta (`card_payment`).
 */
export const creditCardNameSchema = z
  .string({ error: 'Informe o nome do cartão.' })
  .trim()
  .min(1, { error: 'Informe o nome do cartão.' })
  .max(60, { error: 'Nome muito longo (máximo 60 caracteres).' });

const dayOfMonthField = (message: string) =>
  z
    .number({ error: message })
    .int({ error: message })
    .min(1, { error: message })
    .max(31, { error: message });

export const MAX_INSTALLMENTS = 48;

export const invoiceStatusSchema = z.enum(['open', 'closed', 'paid']);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

/**
 * Fatura. Valores calculados pelo backend:
 * total = Σ parcelas das compras não canceladas; pago = Σ pagamentos efetivados;
 * agendado = Σ pagamentos pendentes; em aberto = total − pago (negativo = crédito, ex.: estorno).
 * Status: `open` (ainda recebe compras: hoje ≤ fechamento), `closed` (fechada com valor em aberto),
 * `paid` (nada em aberto). `overdue`: passou do vencimento com valor em aberto.
 */
export const invoiceSummarySchema = z.object({
  id: z.uuid(),
  creditCardId: z.uuid(),
  /** Mês do VENCIMENTO da fatura (AAAA-MM): é nele que a despesa das parcelas é reconhecida. */
  referenceMonth: monthSchema,
  closingDate: dateOnlySchema,
  dueDate: dateOnlySchema,
  status: invoiceStatusSchema,
  overdue: z.boolean(),
  totalCents: signedCentsSchema,
  paidCents: signedCentsSchema,
  scheduledCents: signedCentsSchema,
  remainingCents: signedCentsSchema,
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const creditCardSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  limitCents: positiveCentsSchema,
  closingDay: z.number().int(),
  dueDay: z.number().int(),
  /** Conta sugerida para pagar as faturas. */
  paymentAccountId: z.uuid().nullable(),
  archivedAt: z.iso.datetime().nullable(),
  /** Limite comprometido: parcelas ainda não pagas (de todas as faturas). */
  usedLimitCents: signedCentsSchema,
  /** limite − usado (pode ficar negativo: o app avisa, não bloqueia). */
  availableLimitCents: signedCentsSchema,
  /** Fatura aberta (que ainda recebe compras), se já existir. */
  openInvoice: invoiceSummarySchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type CreditCard = z.infer<typeof creditCardSchema>;

export const createCreditCardRequestSchema = z.object({
  name: creditCardNameSchema,
  limitCents: positiveCentsSchema,
  closingDay: dayOfMonthField('Informe o dia de fechamento (1 a 31).'),
  dueDay: dayOfMonthField('Informe o dia de vencimento (1 a 31).'),
  paymentAccountId: z.uuid().nullish(),
});
export type CreateCreditCardRequest = z.input<typeof createCreditCardRequestSchema>;

/** Fechamento e vencimento novos valem só para faturas criadas depois; as existentes não mudam. */
export const updateCreditCardRequestSchema = z
  .object({
    name: creditCardNameSchema.optional(),
    limitCents: positiveCentsSchema.optional(),
    closingDay: dayOfMonthField('Informe o dia de fechamento (1 a 31).').optional(),
    dueDay: dayOfMonthField('Informe o dia de vencimento (1 a 31).').optional(),
    paymentAccountId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateCreditCardRequest = z.infer<typeof updateCreditCardRequestSchema>;

export const listCreditCardsQuerySchema = z.object({
  includeArchived: z.stringbool().default(false),
});
export const creditCardListResponseSchema = z.object({ items: z.array(creditCardSchema) });

// ---------- Compras e parcelas ----------

export const purchaseInstallmentSchema = z.object({
  installmentNumber: z.number().int().positive(),
  amountCents: positiveCentsSchema,
  invoiceId: z.uuid(),
  referenceMonth: monthSchema,
  dueDate: dateOnlySchema,
});

export const purchaseSchema = z.object({
  id: z.uuid(),
  creditCardId: z.uuid(),
  description: z.string(),
  /** Data da compra (nunca no futuro). */
  purchaseDate: dateOnlySchema,
  totalAmountCents: positiveCentsSchema,
  installmentsCount: z.number().int().positive(),
  categoryId: z.uuid().nullable(),
  /** Compra cancelada (estorno): suas parcelas deixam de contar em fatura, limite e orçamento. */
  cancelled: z.boolean(),
  installments: z.array(purchaseInstallmentSchema),
  createdAt: z.iso.datetime(),
});
export type Purchase = z.infer<typeof purchaseSchema>;

export const createPurchaseRequestSchema = z.object({
  description: descriptionSchema.min(1, { error: 'Informe a descrição da compra.' }),
  purchaseDate: dateOnlySchema,
  totalAmountCents: positiveCentsSchema,
  installmentsCount: z
    .number()
    .int({ error: 'Número de parcelas inválido.' })
    .min(1, { error: 'Informe ao menos 1 parcela.' })
    .max(MAX_INSTALLMENTS, { error: `No máximo ${MAX_INSTALLMENTS} parcelas.` })
    .default(1),
  categoryId: z.uuid().nullish(),
});
export type CreatePurchaseRequest = z.input<typeof createPurchaseRequestSchema>;

/** Valor, data e parcelas não mudam (afetariam faturas já fechadas): cancele e lance de novo. */
export const updatePurchaseRequestSchema = z
  .object({
    description: descriptionSchema.min(1, { error: 'Informe a descrição da compra.' }).optional(),
    categoryId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdatePurchaseRequest = z.infer<typeof updatePurchaseRequestSchema>;

export const purchaseListResponseSchema = z.object({ items: z.array(purchaseSchema) });

// ---------- Faturas e pagamento ----------

export const invoiceListResponseSchema = z.object({ items: z.array(invoiceSummarySchema) });

export const invoiceDetailSchema = invoiceSummarySchema.extend({
  cardName: z.string(),
  installments: z.array(
    z.object({
      purchaseId: z.uuid(),
      description: z.string(),
      purchaseDate: dateOnlySchema,
      categoryId: z.uuid().nullable(),
      installmentNumber: z.number().int().positive(),
      installmentsCount: z.number().int().positive(),
      amountCents: positiveCentsSchema,
    }),
  ),
  payments: z.array(
    z.object({
      id: z.uuid(),
      accountId: z.uuid(),
      amountCents: positiveCentsSchema,
      date: dateOnlySchema,
      status: z.enum(['pending', 'completed', 'cancelled']),
    }),
  ),
});
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;

/**
 * Pagamento da fatura (`card_payment`): sai da conta pagadora, NÃO é despesa (já contada nas parcelas).
 * Sem valor, paga o que resta sem agendamento; sem data, paga hoje.
 */
export const payInvoiceRequestSchema = z.object({
  accountId: z.uuid({ error: 'Escolha a conta pagadora.' }),
  amountCents: positiveCentsSchema.optional(),
  paymentDate: dateOnlySchema.optional(),
});
export type PayInvoiceRequest = z.infer<typeof payInvoiceRequestSchema>;
