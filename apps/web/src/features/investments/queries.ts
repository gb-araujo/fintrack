import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import * as investments from '../../services/investments';

export function useInvestments() {
  return useQuery({
    queryKey: ['investments', 'list'],
    queryFn: ({ signal }) => investments.listInvestments(signal),
    select: (data) => data.items,
  });
}

export function useInvestment(accountId: string) {
  const list = useInvestments();
  return {
    ...list,
    data: list.data?.find((item) => item.accountId === accountId),
  };
}

export function useValuations(accountId: string) {
  return useQuery({
    queryKey: ['investments', 'valuations', accountId],
    queryFn: ({ signal }) => investments.listValuations(accountId, signal),
    select: (data) => data.items,
  });
}

/** Avaliações e correção de instituição/produto mexem no saldo, no painel e nos relatórios. */
function invalidateInvestments(client: QueryClient, accountId: string) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['investments'] }),
    client.invalidateQueries({ queryKey: ['accounts'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
    client.invalidateQueries({ queryKey: ['reports'] }),
  ]).then(() => accountId);
}

export function useUpsertValuation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (variables: {
      accountId: string;
      input: Parameters<typeof investments.upsertValuation>[1];
    }) => investments.upsertValuation(variables.accountId, variables.input),
    onSuccess: (_data, variables) => invalidateInvestments(client, variables.accountId),
  });
}

export function useDeleteValuation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (variables: { accountId: string; id: string }) =>
      investments.deleteValuation(variables.accountId, variables.id),
    onSuccess: (_data, variables) => invalidateInvestments(client, variables.accountId),
  });
}

export function useUpdateInvestmentDetails() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (variables: {
      accountId: string;
      input: Parameters<typeof investments.updateDetails>[1];
    }) => investments.updateDetails(variables.accountId, variables.input),
    onSuccess: (_data, variables) => invalidateInvestments(client, variables.accountId),
  });
}
