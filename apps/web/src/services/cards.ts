import {
  creditCardListResponseSchema,
  creditCardSchema,
  invoiceDetailSchema,
  invoiceListResponseSchema,
  purchaseListResponseSchema,
  purchaseSchema,
  transactionSchema,
  type CreateCreditCardRequest,
  type CreatePurchaseRequest,
  type PayInvoiceRequest,
  type UpdateCreditCardRequest,
} from '@fintrack/shared';
import { apiRequest } from './http';

const API = '/api/v1';

// ---------- Cartões ----------
export const listCards = (includeArchived: boolean, signal?: AbortSignal) =>
  apiRequest(`${API}/credit-cards?includeArchived=${includeArchived}`, {
    schema: creditCardListResponseSchema,
    signal,
  });

export const getCard = (id: string, signal?: AbortSignal) =>
  apiRequest(`${API}/credit-cards/${id}`, { schema: creditCardSchema, signal });

export const createCard = (input: CreateCreditCardRequest) =>
  apiRequest(`${API}/credit-cards`, { schema: creditCardSchema, method: 'POST', body: input });

export const updateCard = (id: string, input: UpdateCreditCardRequest) =>
  apiRequest(`${API}/credit-cards/${id}`, {
    schema: creditCardSchema,
    method: 'PATCH',
    body: input,
  });

export const setCardArchived = (id: string, archived: boolean) =>
  apiRequest(`${API}/credit-cards/${id}/${archived ? 'archive' : 'unarchive'}`, {
    schema: creditCardSchema,
    method: 'POST',
  });

// ---------- Compras ----------
export const listPurchases = (cardId: string, signal?: AbortSignal) =>
  apiRequest(`${API}/credit-cards/${cardId}/purchases`, {
    schema: purchaseListResponseSchema,
    signal,
  });

export const createPurchase = (cardId: string, input: CreatePurchaseRequest) =>
  apiRequest(`${API}/credit-cards/${cardId}/purchases`, {
    schema: purchaseSchema,
    method: 'POST',
    body: input,
  });

export const cancelPurchase = (id: string) =>
  apiRequest(`${API}/purchases/${id}/cancel`, { schema: purchaseSchema, method: 'POST' });

// ---------- Faturas ----------
export const listInvoices = (cardId: string, signal?: AbortSignal) =>
  apiRequest(`${API}/credit-cards/${cardId}/invoices`, {
    schema: invoiceListResponseSchema,
    signal,
  });

export const getInvoice = (id: string, signal?: AbortSignal) =>
  apiRequest(`${API}/invoices/${id}`, { schema: invoiceDetailSchema, signal });

export const payInvoice = (id: string, input: PayInvoiceRequest) =>
  apiRequest(`${API}/invoices/${id}/payments`, {
    schema: transactionSchema,
    method: 'POST',
    body: input,
  });
