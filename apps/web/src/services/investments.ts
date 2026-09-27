import {
  investmentListResponseSchema,
  investmentSummarySchema,
  investmentValuationSchema,
  valuationListResponseSchema,
  type UpdateInvestmentDetailsRequest,
  type UpsertValuationRequest,
} from '@fintrack/shared';
import { z } from 'zod';
import { apiRequest } from './http';

const API = '/api/v1/investments';

export const listInvestments = (signal?: AbortSignal) =>
  apiRequest(API, { schema: investmentListResponseSchema, signal });

export const listValuations = (accountId: string, signal?: AbortSignal) =>
  apiRequest(`${API}/${accountId}/valuations`, { schema: valuationListResponseSchema, signal });

export const upsertValuation = (accountId: string, input: UpsertValuationRequest) =>
  apiRequest(`${API}/${accountId}/valuations`, {
    schema: investmentValuationSchema,
    method: 'PUT',
    body: input,
  });

export const deleteValuation = (accountId: string, id: string) =>
  apiRequest(`${API}/${accountId}/valuations/${id}`, { schema: z.undefined(), method: 'DELETE' });

export const updateDetails = (accountId: string, input: UpdateInvestmentDetailsRequest) =>
  apiRequest(`${API}/${accountId}`, {
    schema: investmentSummarySchema,
    method: 'PATCH',
    body: input,
  });
