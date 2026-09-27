import {
  budgetListResponseSchema,
  budgetSchema,
  occurrenceListResponseSchema,
  recurringListResponseSchema,
  recurringSchema,
  transactionSchema,
  type ConfirmOccurrenceRequest,
  type CreateRecurringRequest,
  type UpdateRecurringRequest,
  type UpsertBudgetRequest,
} from '@fintrack/shared';
import { z } from 'zod';
import { apiRequest } from './http';

const API = '/api/v1';

// ---------- Recorrências ----------
export const listRecurring = (includeInactive: boolean, signal?: AbortSignal) =>
  apiRequest(`${API}/recurring?includeInactive=${includeInactive}`, {
    schema: recurringListResponseSchema,
    signal,
  });

export const listOccurrences = (signal?: AbortSignal) =>
  apiRequest(`${API}/recurring/occurrences`, { schema: occurrenceListResponseSchema, signal });

export const createRecurring = (input: CreateRecurringRequest) =>
  apiRequest(`${API}/recurring`, { schema: recurringSchema, method: 'POST', body: input });

export const updateRecurring = (id: string, input: UpdateRecurringRequest) =>
  apiRequest(`${API}/recurring/${id}`, { schema: recurringSchema, method: 'PATCH', body: input });

export const setRecurringActive = (id: string, active: boolean) =>
  apiRequest(`${API}/recurring/${id}/${active ? 'activate' : 'deactivate'}`, {
    schema: recurringSchema,
    method: 'POST',
  });

export const confirmOccurrence = (id: string, date: string, input: ConfirmOccurrenceRequest) =>
  apiRequest(`${API}/recurring/${id}/occurrences/${date}/confirm`, {
    schema: transactionSchema,
    method: 'POST',
    body: input,
  });

export const skipOccurrence = (id: string, date: string) =>
  apiRequest(`${API}/recurring/${id}/occurrences/${date}/skip`, {
    schema: transactionSchema,
    method: 'POST',
  });

// ---------- Orçamentos ----------
export const listBudgets = (month: string, signal?: AbortSignal) =>
  apiRequest(`${API}/budgets?month=${month}`, { schema: budgetListResponseSchema, signal });

export const upsertBudget = (input: UpsertBudgetRequest) =>
  apiRequest(`${API}/budgets`, { schema: budgetSchema, method: 'PUT', body: input });

export const deleteBudget = (id: string) =>
  apiRequest(`${API}/budgets/${id}`, { schema: z.undefined(), method: 'DELETE' });
