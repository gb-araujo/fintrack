import { dashboardSchema } from '@fintrack/shared';
import { apiRequest } from './http';

/** Horizonte do painel: uma data (`until`), hoje + N dias (`days`) ou, sem nada, o fim do mês. */
export interface DashboardHorizon {
  until?: string;
  days?: number;
}

export function fetchDashboard(horizon: DashboardHorizon = {}, signal?: AbortSignal) {
  const params = new URLSearchParams();
  if (horizon.until) params.set('until', horizon.until);
  else if (horizon.days) params.set('days', String(horizon.days));
  const query = params.toString();
  return apiRequest(`/api/v1/dashboard${query ? `?${query}` : ''}`, {
    schema: dashboardSchema,
    signal,
  });
}
