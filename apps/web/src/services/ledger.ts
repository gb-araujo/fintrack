import {
  accountListResponseSchema,
  accountSchema,
  categoryListResponseSchema,
  categorySchema,
  transactionListResponseSchema,
  transactionSchema,
  transferSchema,
  type CreateAccountRequest,
  type CreateCategoryRequest,
  type CreateTransactionRequest,
  type CreateTransferRequest,
  type UpdateAccountRequest,
  type UpdateTransactionRequest,
  type UpdateTransferRequest,
} from '@fintrack/shared';
import { apiRequest } from './http';

const API = '/api/v1';

// ---------- Contas ----------
export const listAccounts = (includeArchived: boolean, signal?: AbortSignal) =>
  apiRequest(`${API}/accounts?includeArchived=${includeArchived}`, {
    schema: accountListResponseSchema,
    signal,
  });

export const createAccount = (input: CreateAccountRequest) =>
  apiRequest(`${API}/accounts`, { schema: accountSchema, method: 'POST', body: input });

export const updateAccount = (id: string, input: UpdateAccountRequest) =>
  apiRequest(`${API}/accounts/${id}`, { schema: accountSchema, method: 'PATCH', body: input });

export const archiveAccount = (id: string) =>
  apiRequest(`${API}/accounts/${id}/archive`, { schema: accountSchema, method: 'POST' });

export const unarchiveAccount = (id: string) =>
  apiRequest(`${API}/accounts/${id}/unarchive`, { schema: accountSchema, method: 'POST' });

// ---------- Categorias ----------
export const listCategories = (includeArchived: boolean, signal?: AbortSignal) =>
  apiRequest(`${API}/categories?includeArchived=${includeArchived}`, {
    schema: categoryListResponseSchema,
    signal,
  });

export const createCategory = (input: CreateCategoryRequest) =>
  apiRequest(`${API}/categories`, { schema: categorySchema, method: 'POST', body: input });

export const renameCategory = (id: string, name: string) =>
  apiRequest(`${API}/categories/${id}`, {
    schema: categorySchema,
    method: 'PATCH',
    body: { name },
  });

export const archiveCategory = (id: string) =>
  apiRequest(`${API}/categories/${id}/archive`, { schema: categorySchema, method: 'POST' });

export const unarchiveCategory = (id: string) =>
  apiRequest(`${API}/categories/${id}/unarchive`, { schema: categorySchema, method: 'POST' });

// ---------- Lançamentos ----------
export interface TransactionFilters {
  accountId?: string;
  type?: 'income' | 'expense' | 'transfer';
  status?: 'pending' | 'completed' | 'cancelled';
  from?: string;
  to?: string;
  q?: string;
  includeCancelled?: boolean;
}

export const PAGE_SIZE = 30;

export function transactionsQuery(filters: TransactionFilters, cursor?: string): string {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value));
  }
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export const listTransactions = (
  filters: TransactionFilters,
  cursor?: string,
  signal?: AbortSignal,
) =>
  apiRequest(`${API}/transactions?${transactionsQuery(filters, cursor)}`, {
    schema: transactionListResponseSchema,
    signal,
  });

export const createTransaction = (input: CreateTransactionRequest) =>
  apiRequest(`${API}/transactions`, { schema: transactionSchema, method: 'POST', body: input });

export const updateTransaction = (id: string, input: UpdateTransactionRequest) =>
  apiRequest(`${API}/transactions/${id}`, {
    schema: transactionSchema,
    method: 'PATCH',
    body: input,
  });

export const completeTransaction = (id: string, transactionDate?: string) =>
  apiRequest(`${API}/transactions/${id}/complete`, {
    schema: transactionSchema,
    method: 'POST',
    ...(transactionDate ? { body: { transactionDate } } : {}),
  });

export const cancelTransaction = (id: string) =>
  apiRequest(`${API}/transactions/${id}/cancel`, { schema: transactionSchema, method: 'POST' });

// ---------- Transferências ----------
export const createTransfer = (input: CreateTransferRequest) =>
  apiRequest(`${API}/transfers`, { schema: transferSchema, method: 'POST', body: input });

export const updateTransfer = (id: string, input: UpdateTransferRequest) =>
  apiRequest(`${API}/transfers/${id}`, { schema: transferSchema, method: 'PATCH', body: input });

export const completeTransfer = (id: string, transactionDate?: string) =>
  apiRequest(`${API}/transfers/${id}/complete`, {
    schema: transferSchema,
    method: 'POST',
    ...(transactionDate ? { body: { transactionDate } } : {}),
  });

export const cancelTransfer = (id: string) =>
  apiRequest(`${API}/transfers/${id}/cancel`, { schema: transferSchema, method: 'POST' });
