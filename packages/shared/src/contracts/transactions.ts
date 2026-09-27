import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import {
  paymentMethodSchema,
  transactionStatusSchema,
  transactionTypeSchema,
  transferDirectionSchema,
} from '../enums/index.js';
import { positiveCentsSchema } from '../money/money.js';

export const descriptionSchema = z
  .string()
  .trim()
  .max(200, { error: 'Descrição muito longa (máximo 200 caracteres).' });

/** Tipos que o usuário lança diretamente. Transferências têm rotas próprias (/transfers). */
export const manualTransactionTypeSchema = z.enum(['income', 'expense']);
export type ManualTransactionType = z.infer<typeof manualTransactionTypeSchema>;

/** Status na criação: `completed` exige data até hoje; sem informar, a API decide pela data. */
export const initialStatusSchema = z.enum(['pending', 'completed']);

export const transactionSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  type: transactionTypeSchema,
  amountCents: positiveCentsSchema,
  description: z.string(),
  transactionDate: dateOnlySchema,
  paymentMethod: paymentMethodSchema.nullable(),
  status: transactionStatusSchema,
  /** Recorrência que originou este lançamento (confirmado ou pulado), se houver. */
  recurringId: z.uuid().nullable(),
  /** Presente apenas nas pernas de uma transferência. */
  transfer: z
    .object({
      id: z.uuid(),
      direction: transferDirectionSchema,
      fromAccountId: z.uuid(),
      toAccountId: z.uuid(),
    })
    .nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const createTransactionRequestSchema = z.object({
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  type: manualTransactionTypeSchema,
  categoryId: z.uuid().nullish(),
  amountCents: positiveCentsSchema,
  description: descriptionSchema.default(''),
  transactionDate: dateOnlySchema,
  paymentMethod: paymentMethodSchema.nullish(),
  status: initialStatusSchema.optional(),
});
export type CreateTransactionRequest = z.input<typeof createTransactionRequestSchema>;

/** O tipo não muda: para trocar receita por despesa, cancele e lance de novo. */
export const updateTransactionRequestSchema = z
  .object({
    accountId: z.uuid().optional(),
    categoryId: z.uuid().nullable().optional(),
    amountCents: positiveCentsSchema.optional(),
    description: descriptionSchema.optional(),
    transactionDate: dateOnlySchema.optional(),
    paymentMethod: paymentMethodSchema.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateTransactionRequest = z.infer<typeof updateTransactionRequestSchema>;

/** Efetivar: opcionalmente informa a data em que foi paga/recebida (padrão: a data do lançamento). */
export const completeRequestSchema = z.object({ transactionDate: dateOnlySchema.optional() });
export type CompleteRequest = z.infer<typeof completeRequestSchema>;

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 50;

export const listTransactionsQuerySchema = z
  .object({
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    type: transactionTypeSchema.optional(),
    status: transactionStatusSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    /** Busca por trecho da descrição. */
    q: z.string().trim().min(1).max(100).optional(),
    /** Cancelados ficam ocultos, a menos que se peça (ou se filtre por status=cancelled). */
    includeCancelled: z.stringbool().default(false),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    cursor: z.string().min(1).max(500).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'A data inicial deve ser anterior ou igual à final.',
    path: ['from'],
  });
export type ListTransactionsQuery = z.output<typeof listTransactionsQuerySchema>;

export const transactionListResponseSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;
