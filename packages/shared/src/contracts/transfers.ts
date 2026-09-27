import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { transactionStatusSchema } from '../enums/index.js';
import { positiveCentsSchema } from '../money/money.js';
import { descriptionSchema, initialStatusSchema } from './transactions.js';

export const transferSchema = z.object({
  id: z.uuid(),
  fromAccountId: z.uuid(),
  toAccountId: z.uuid(),
  amountCents: positiveCentsSchema,
  transferDate: dateOnlySchema,
  status: transactionStatusSchema,
  description: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Transfer = z.infer<typeof transferSchema>;

export const createTransferRequestSchema = z
  .object({
    fromAccountId: z.uuid({ error: 'Escolha a conta de origem.' }),
    toAccountId: z.uuid({ error: 'Escolha a conta de destino.' }),
    amountCents: positiveCentsSchema,
    transferDate: dateOnlySchema,
    description: descriptionSchema.default(''),
    status: initialStatusSchema.optional(),
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    error: 'A conta de origem e a de destino devem ser diferentes.',
    path: ['toAccountId'],
  });
export type CreateTransferRequest = z.input<typeof createTransferRequestSchema>;

export const updateTransferRequestSchema = z
  .object({
    fromAccountId: z.uuid().optional(),
    toAccountId: z.uuid().optional(),
    amountCents: positiveCentsSchema.optional(),
    transferDate: dateOnlySchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateTransferRequest = z.infer<typeof updateTransferRequestSchema>;
