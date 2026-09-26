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
