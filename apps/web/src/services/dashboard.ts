import { dashboardSchema } from '@fintrack/shared';
import { apiRequest } from './http';

export function fetchDashboard(until?: string, signal?: AbortSignal) {
  const query = until ? `?until=${until}` : '';
  return apiRequest(`/api/v1/dashboard${query}`, { schema: dashboardSchema, signal });
}
