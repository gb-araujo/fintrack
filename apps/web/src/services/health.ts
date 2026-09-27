import { healthResponseSchema, type HealthResponse } from '@fintrack/shared';
import { apiRequest } from './http';

/** /health responde 503 (com o mesmo corpo) quando alguma dependência está fora. Rota pública. */
export function fetchApiHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest('/health', {
    schema: healthResponseSchema,
    method: 'GET',
    signal,
    acceptStatuses: [503],
    auth: false,
  });
}
