import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as imports from '../../services/imports';
import { invalidateLedger } from '../ledger/queries';

export function useImports() {
  return useQuery({
    queryKey: ['imports', 'list'],
    queryFn: ({ signal }) => imports.listImports(signal),
    select: (data) => data.items,
  });
}

export function useImport(id: string) {
  return useQuery({
    queryKey: ['imports', 'detail', id],
    queryFn: ({ signal }) => imports.getImport(id, signal),
  });
}

export function usePayableInvoices() {
  return useQuery({
    queryKey: ['cards', 'payable'],
    queryFn: ({ signal }) => imports.listPayableInvoices(signal),
    select: (data) => data.items,
  });
}

export function useRules() {
  return useQuery({
    queryKey: ['imports', 'rules'],
    queryFn: ({ signal }) => imports.listRules(signal),
    select: (data) => data.items,
  });
}

/** Ler o arquivo não cria lançamentos: só o histórico de importações muda. */
export function useCreateImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: imports.createImport,
    onSuccess: () => client.invalidateQueries({ queryKey: ['imports'] }),
  });
}

/** Confirmar e desfazer criam/cancelam lançamentos: invalidam saldos, listas, painel e orçamentos. */
function useLedgerImportMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        invalidateLedger(client),
        client.invalidateQueries({ queryKey: ['imports'] }),
      ]);
    },
  });
}

export const useConfirmImport = () =>
  useLedgerImportMutation((v: { id: string; input: Parameters<typeof imports.confirmImport>[1] }) =>
    imports.confirmImport(v.id, v.input),
  );
export const useRevertImport = () => useLedgerImportMutation(imports.revertImport);

export function useCancelImport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: imports.cancelImport,
    onSuccess: () => client.invalidateQueries({ queryKey: ['imports'] }),
  });
}

function useRuleMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => client.invalidateQueries({ queryKey: ['imports', 'rules'] }),
  });
}

export const useCreateRule = () => useRuleMutation(imports.createRule);
export const useDeleteRule = () => useRuleMutation(imports.deleteRule);
