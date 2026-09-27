import { z } from 'zod';
import { accountTypeSchema } from '../enums/index.js';
import { signedCentsSchema } from '../money/money.js';

export const accountNameSchema = z
  .string({ error: 'Informe o nome da conta.' })
  .trim()
  .min(1, { error: 'Informe o nome da conta.' })
  .max(60, { error: 'Nome muito longo (máximo 60 caracteres).' });

export const accountSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: accountTypeSchema,
  /** Saldo antes de qualquer lançamento. Pode ser negativo (cheque especial). */
  initialBalanceCents: signedCentsSchema,
  /** Saldo atual, calculado pelo backend: saldo inicial + lançamentos efetivados. */
  balanceCents: signedCentsSchema,
  includeInAvailable: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Account = z.infer<typeof accountSchema>;

export const createAccountRequestSchema = z.object({
  name: accountNameSchema,
  type: accountTypeSchema,
  initialBalanceCents: signedCentsSchema.default(0),
  /** Padrão: contas bancárias e carteiras entram; investimentos não. */
  includeInAvailable: z.boolean().optional(),
});
export type CreateAccountRequest = z.input<typeof createAccountRequestSchema>;

/** O tipo da conta não muda depois de criada (o histórico de lançamentos depende dele). */
export const updateAccountRequestSchema = z
  .object({
    name: accountNameSchema.optional(),
    initialBalanceCents: signedCentsSchema.optional(),
    includeInAvailable: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;

export const listAccountsQuerySchema = z.object({
  includeArchived: z.stringbool().default(false),
});

export const accountListResponseSchema = z.object({ items: z.array(accountSchema) });
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
