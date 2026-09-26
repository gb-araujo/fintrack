import { useQuery } from '@tanstack/react-query';
import { fetchApiHealth } from '../services/health';

export const apiHealthQueryKey = ['api-health'] as const;

export function useApiHealth() {
  return useQuery({
    queryKey: apiHealthQueryKey,
    queryFn: ({ signal }) => fetchApiHealth(signal),
    refetchInterval: 60_000,
  });
}
