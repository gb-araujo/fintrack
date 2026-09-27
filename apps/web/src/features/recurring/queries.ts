import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as planning from '../../services/planning';
import { invalidateLedger } from '../ledger/queries';

export function useRecurring(includeInactive: boolean) {
  return useQuery({
    queryKey: ['recurring', 'rules', { includeInactive }],
    queryFn: ({ signal }) => planning.listRecurring(includeInactive, signal),
    select: (data) => data.items,
  });
}

/** Previsões (ocorrências ainda sem lançamento): atrasadas e próximas. */
export function useOccurrences() {
  return useQuery({
    queryKey: ['recurring', 'occurrences'],
    queryFn: ({ signal }) => planning.listOccurrences(signal),
    select: (data) => data.items,
  });
}

/** Regras mudam previsões, painel e orçamentos (nunca saldos: nada vira lançamento sem confirmar). */
function useRuleMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['recurring'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['budgets'] }),
      ]);
    },
  });
}

export const useCreateRecurring = () => useRuleMutation(planning.createRecurring);
export const useUpdateRecurring = () =>
  useRuleMutation((v: { id: string; input: Parameters<typeof planning.updateRecurring>[1] }) =>
    planning.updateRecurring(v.id, v.input),
  );
export const useSetRecurringActive = () =>
  useRuleMutation((v: { id: string; active: boolean }) =>
    planning.setRecurringActive(v.id, v.active),
  );

/** Confirmar/pular cria (ou cancela) um lançamento: invalida saldos, listas, painel e orçamentos. */
function useOccurrenceMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => invalidateLedger(client) });
}

export const useConfirmOccurrence = () =>
  useOccurrenceMutation(
    (v: { id: string; date: string; input: Parameters<typeof planning.confirmOccurrence>[2] }) =>
      planning.confirmOccurrence(v.id, v.date, v.input),
  );
export const useSkipOccurrence = () =>
  useOccurrenceMutation((v: { id: string; date: string }) => planning.skipOccurrence(v.id, v.date));
