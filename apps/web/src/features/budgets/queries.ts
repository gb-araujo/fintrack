import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as planning from '../../services/planning';

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ['budgets', { month }],
    queryFn: ({ signal }) => planning.listBudgets(month, signal),
  });
}

function useBudgetMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: ['budgets'] }),
  });
}

export const useUpsertBudget = () => useBudgetMutation(planning.upsertBudget);
export const useDeleteBudget = () => useBudgetMutation(planning.deleteBudget);
