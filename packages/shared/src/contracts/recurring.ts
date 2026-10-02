import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { recurrenceFrequencySchema } from '../enums/index.js';
import { positiveCentsSchema } from '../money/money.js';
import { manualTransactionTypeSchema, transactionSchema } from './transactions.js';

/**
 * Recorrência = regra que gera PREVISÕES (ocorrências virtuais), nunca lançamentos por conta
 * própria (ADR 0008). Só vira lançamento quando o usuário confirma (ou se `autoConfirm`).
 */
export const recurringNameSchema = z
  .string({ error: 'Informe o nome.' })
  .trim()
  .min(1, { error: 'Informe o nome.' })
  .max(80, { error: 'Nome muito longo (máximo 80 caracteres).' });

const recurringFields = {
  name: recurringNameSchema,
  type: manualTransactionTypeSchema,
  /** Valor fixo, ou estimativa quando `isVariableAmount` (ex.: conta de energia). */
  amountCents: positiveCentsSchema.nullish(),
  isVariableAmount: z.boolean().default(false),
  accountId: z.uuid({ error: 'Escolha a conta.' }),
  categoryId: z.uuid().nullish(),
  frequency: recurrenceFrequencySchema,
  /** A cada N períodos (1 = todo mês/semana/ano). */
  interval: z.number().int().min(1).max(24).default(1),
  /** Dia do vencimento (mensal). Semanal e anual usam o dia da data de início. */
  dayOfMonth: z.number().int().min(1).max(31).nullish(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullish(),
  /** Confirma sozinha ao chegar o dia (só para valor fixo). */
  autoConfirm: z.boolean().default(false),
  /** Entra nas previsões do dinheiro disponível. */
  includeInForecast: z.boolean().default(true),
};

function validateRule(
  value: {
    frequency?: string | undefined;
    dayOfMonth?: number | null | undefined;
    amountCents?: number | null | undefined;
    isVariableAmount?: boolean | undefined;
    autoConfirm?: boolean | undefined;
    startDate?: string | undefined;
    endDate?: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (value.frequency === 'monthly' && !value.dayOfMonth) {
    ctx.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Informe o dia do vencimento.' });
  }
  if (!value.isVariableAmount && (value.amountCents === null || value.amountCents === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['amountCents'], message: 'Informe o valor.' });
  }
  if (value.autoConfirm && value.isVariableAmount) {
    ctx.addIssue({
      code: 'custom',
      path: ['autoConfirm'],
      message: 'Confirmação automática só vale para valor fixo.',
    });
  }
  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'O fim deve ser depois do início.',
    });
  }
}

export const recurringSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: manualTransactionTypeSchema,
  amountCents: positiveCentsSchema.nullable(),
  isVariableAmount: z.boolean(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  frequency: recurrenceFrequencySchema,
  interval: z.number().int(),
  dayOfMonth: z.number().int().nullable(),
  startDate: dateOnlySchema,
  endDate: dateOnlySchema.nullable(),
  autoConfirm: z.boolean(),
  includeInForecast: z.boolean(),
  active: z.boolean(),
  /** Próxima ocorrência ainda não confirmada (a partir de hoje), se houver. */
  nextDate: dateOnlySchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type Recurring = z.infer<typeof recurringSchema>;

export const createRecurringRequestSchema = z.object(recurringFields).superRefine(validateRule);
export type CreateRecurringRequest = z.input<typeof createRecurringRequestSchema>;

export const updateRecurringRequestSchema = z
  .object({
    name: recurringFields.name.optional(),
    amountCents: recurringFields.amountCents,
    isVariableAmount: z.boolean().optional(),
    accountId: z.uuid().optional(),
    categoryId: z.uuid().nullish(),
    interval: z.number().int().min(1).max(24).optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullish(),
    endDate: dateOnlySchema.nullish(),
    autoConfirm: z.boolean().optional(),
    includeInForecast: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateRecurringRequest = z.infer<typeof updateRecurringRequestSchema>;

export const listRecurringQuerySchema = z.object({
  includeInactive: z.stringbool().default(false),
});

export const recurringListResponseSchema = z.object({ items: z.array(recurringSchema) });

/** Ocorrência VIRTUAL: previsão calculada, ainda sem lançamento correspondente. */
export const occurrenceSchema = z.object({
  recurringId: z.uuid(),
  name: z.string(),
  type: manualTransactionTypeSchema,
  date: dateOnlySchema,
  /** Valor previsto: o fixo, ou o último confirmado / a estimativa quando variável. */
  amountCents: z.number().int().nonnegative(),
  /** Valor variável: o número é uma estimativa. */
  estimated: z.boolean(),
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  overdue: z.boolean(),
});
export type Occurrence = z.infer<typeof occurrenceSchema>;

export const listOccurrencesQuerySchema = z.object({
  /** Até quando prever (padrão: 60 dias a partir de hoje). */
  until: dateOnlySchema.optional(),
});

export const occurrenceListResponseSchema = z.object({
  from: dateOnlySchema,
  until: dateOnlySchema,
  items: z.array(occurrenceSchema),
});

export const occurrenceParamsSchema = z.object({ id: z.uuid(), date: dateOnlySchema });

export const confirmOccurrenceRequestSchema = z.object({
  /** Valor realmente pago/recebido (obrigatório na prática para contas variáveis). */
  amountCents: positiveCentsSchema.optional(),
  /** Data em que aconteceu (até hoje). Padrão: a data da ocorrência. */
  transactionDate: dateOnlySchema.optional(),
});
export type ConfirmOccurrenceRequest = z.infer<typeof confirmOccurrenceRequestSchema>;

export { transactionSchema as occurrenceTransactionSchema };
