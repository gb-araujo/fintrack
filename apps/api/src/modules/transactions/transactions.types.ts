import type {
  PaymentMethod,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from '@fintrack/shared';

export interface TransactionRecord {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amountCents: number;
  description: string;
  transactionDate: string;
  paymentMethod: PaymentMethod | null;
  status: TransactionStatus;
  recurringId: string | null;
  /** Fatura paga por este lançamento (apenas `card_payment`). */
  creditCardInvoiceId: string | null;
  transfer: {
    id: string;
    direction: TransferDirection;
    fromAccountId: string;
    toAccountId: string;
  } | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewTransaction {
  accountId: string;
  categoryId: string | null;
  /** `card_payment` só é criado pelo módulo de cartões (com `creditCardInvoiceId`). */
  type: 'income' | 'expense' | 'card_payment';
  amountCents: number;
  description: string;
  transactionDate: string;
  paymentMethod: PaymentMethod | null;
  /** 'cancelled' só para marcar uma ocorrência de recorrência como pulada. */
  status: 'pending' | 'completed' | 'cancelled';
  /** Ocorrência de recorrência que originou este lançamento (confirmação ou "pular"). */
  recurring?: { id: string; occurrenceDate: string };
  /** Fatura paga (obrigatório em `card_payment`, proibido nos demais). */
  creditCardInvoiceId?: string;
}

export interface TransactionPatch {
  accountId?: string;
  categoryId?: string | null;
  amountCents?: number;
  description?: string;
  transactionDate?: string;
  paymentMethod?: PaymentMethod | null;
}

export interface TransactionFilters {
  accountId?: string | undefined;
  categoryId?: string | undefined;
  type?: TransactionType | undefined;
  status?: TransactionStatus | undefined;
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  includeCancelled: boolean;
}

/** Posição na listagem ordenada por (data, criação, id) decrescente. */
export interface PageCursor {
  date: string;
  /** created_at como texto do PostgreSQL: preserva os microssegundos (Date do JS só tem milissegundos). */
  createdAt: string;
  id: string;
}

export interface TransactionPage {
  items: TransactionRecord[];
  nextCursor: PageCursor | null;
}
