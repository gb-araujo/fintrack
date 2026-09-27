import {
  confirmImportResponseSchema,
  importDetailSchema,
  importListResponseSchema,
  merchantRuleListResponseSchema,
  merchantRuleSchema,
  payableInvoiceListResponseSchema,
  type ConfirmImportRequest,
  type CreateMerchantRuleRequest,
  type CreateImportRequest,
} from '@fintrack/shared';
import { z } from 'zod';
import { apiRequest } from './http';

const API = '/api/v1';

export const createImport = (input: CreateImportRequest) =>
  apiRequest(`${API}/imports`, { schema: importDetailSchema, method: 'POST', body: input });

export const listImports = (signal?: AbortSignal) =>
  apiRequest(`${API}/imports`, { schema: importListResponseSchema, signal });

export const getImport = (id: string, signal?: AbortSignal) =>
  apiRequest(`${API}/imports/${id}`, { schema: importDetailSchema, signal });

export const confirmImport = (id: string, input: ConfirmImportRequest) =>
  apiRequest(`${API}/imports/${id}/confirm`, {
    schema: confirmImportResponseSchema,
    method: 'POST',
    body: input,
  });

export const cancelImport = (id: string) =>
  apiRequest(`${API}/imports/${id}/cancel`, { schema: importDetailSchema, method: 'POST' });

export const revertImport = (id: string) =>
  apiRequest(`${API}/imports/${id}/revert`, { schema: importDetailSchema, method: 'POST' });

export const listPayableInvoices = (signal?: AbortSignal) =>
  apiRequest(`${API}/invoices/payable`, { schema: payableInvoiceListResponseSchema, signal });

// ---------- Regras de comerciante ----------
export const listRules = (signal?: AbortSignal) =>
  apiRequest(`${API}/merchant-rules`, { schema: merchantRuleListResponseSchema, signal });

export const createRule = (input: CreateMerchantRuleRequest) =>
  apiRequest(`${API}/merchant-rules`, { schema: merchantRuleSchema, method: 'POST', body: input });

export const deleteRule = (id: string) =>
  apiRequest(`${API}/merchant-rules/${id}`, { schema: z.undefined(), method: 'DELETE' });
