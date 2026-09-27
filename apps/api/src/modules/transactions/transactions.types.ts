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
  type: 'income' | 'expense';
  amountCents: number;
  description: string;
  transactionDate: string;
  paymentMethod: PaymentMethod | null;
  status: 'pending' | 'completed';
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
