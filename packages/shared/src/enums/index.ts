import { z } from 'zod';

/**
 * Enums de domínio compartilhados. A fonte da verdade das regras é o backend;
 * estes valores apenas garantem que API e Web falem o mesmo vocabulário.
 * Ver docs/financial-rules.md.
 */

export const ACCOUNT_TYPES = ['bank', 'wallet', 'investment'] as const;
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export type AccountType = z.infer<typeof accountTypeSchema>;

export const TRANSACTION_TYPES = ['income', 'expense', 'transfer', 'card_payment'] as const;
export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export type TransactionType = z.infer<typeof transactionTypeSchema>;

export const TRANSACTION_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;

export const CATEGORY_KINDS = ['income', 'expense'] as const;
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export type CategoryKind = z.infer<typeof categoryKindSchema>;

export const TRANSFER_DIRECTIONS = ['in', 'out'] as const;
export const transferDirectionSchema = z.enum(TRANSFER_DIRECTIONS);
export type TransferDirection = z.infer<typeof transferDirectionSchema>;

/** Formas de pagamento de lançamentos em conta. Cartão de crédito tem tabelas próprias (FASE 5). */
export const PAYMENT_METHODS = [
  'pix',
  'debit_card',
  'cash',
  'boleto',
  'bank_transfer',
  'other',
] as const;
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const RECURRENCE_FREQUENCIES = ['weekly', 'monthly', 'yearly'] as const;
export const recurrenceFrequencySchema = z.enum(RECURRENCE_FREQUENCIES);
export type RecurrenceFrequency = z.infer<typeof recurrenceFrequencySchema>;
