import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { fetchDashboard } from '../../services/dashboard';
import * as ledger from '../../services/ledger';

export const queryKeys = {
  accounts: (includeArchived: boolean) => ['accounts', { includeArchived }] as const,
  categories: (includeArchived: boolean) => ['categories', { includeArchived }] as const,
  transactions: (filters: ledger.TransactionFilters) => ['transactions', filters] as const,
};

/** Painel calculado pelo backend ("Quanto posso gastar?", saldos, mês, pendências). */
export function useDashboard(until?: string) {
  return useQuery({
    queryKey: ['dashboard', { until: until ?? null }],
    queryFn: ({ signal }) => fetchDashboard(until, signal),
    // Ao mudar o horizonte, mantém o painel anterior na tela até o novo cálculo chegar.
    placeholderData: keepPreviousData,
  });
}

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.accounts(includeArchived),
    queryFn: ({ signal }) => ledger.listAccounts(includeArchived, signal),
    select: (data) => data.items,
  });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: queryKeys.categories(includeArchived),
    queryFn: ({ signal }) => ledger.listCategories(includeArchived, signal),
    select: (data) => data.items,
  });
}

export function useTransactions(filters: ledger.TransactionFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: ({ pageParam, signal }) => ledger.listTransactions(filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
  });
}

/**
 * Qualquer alteração de lançamento pode mudar saldos e listas: invalida contas e lançamentos.
 * (O saldo vem sempre do backend — a web nunca recalcula por conta própria.)
 */
function invalidateLedger(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: ['accounts'] }),
    client.invalidateQueries({ queryKey: ['transactions'] }),
    client.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
}

function useLedgerMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  keys: readonly ('accounts' | 'categories' | 'ledger')[],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      if (keys.includes('ledger')) await invalidateLedger(client);
      if (keys.includes('accounts')) {
        await client.invalidateQueries({ queryKey: ['accounts'] });
        await client.invalidateQueries({ queryKey: ['dashboard'] });
      }
      if (keys.includes('categories')) await client.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export const useCreateAccount = () => useLedgerMutation(ledger.createAccount, ['accounts']);
export const useUpdateAccount = () =>
  useLedgerMutation(
    (v: { id: string; input: Parameters<typeof ledger.updateAccount>[1] }) =>
      ledger.updateAccount(v.id, v.input),
    ['ledger'],
  );
export const useArchiveAccount = () =>
  useLedgerMutation(
    (v: { id: string; archive: boolean }) =>
      v.archive ? ledger.archiveAccount(v.id) : ledger.unarchiveAccount(v.id),
    ['accounts'],
  );

export const useCreateCategory = () => useLedgerMutation(ledger.createCategory, ['categories']);
export const useRenameCategory = () =>
  useLedgerMutation(
    (v: { id: string; name: string }) => ledger.renameCategory(v.id, v.name),
    ['categories'],
  );
export const useArchiveCategory = () =>
  useLedgerMutation(
    (v: { id: string; archive: boolean }) =>
      v.archive ? ledger.archiveCategory(v.id) : ledger.unarchiveCategory(v.id),
    ['categories'],
  );

export const useCreateTransaction = () => useLedgerMutation(ledger.createTransaction, ['ledger']);
export const useUpdateTransaction = () =>
  useLedgerMutation(
    (v: { id: string; input: Parameters<typeof ledger.updateTransaction>[1] }) =>
      ledger.updateTransaction(v.id, v.input),
    ['ledger'],
  );
export const useCompleteTransaction = () =>
  useLedgerMutation(
    (v: { id: string; transactionDate?: string }) =>
      ledger.completeTransaction(v.id, v.transactionDate),
    ['ledger'],
  );
export const useCancelTransaction = () => useLedgerMutation(ledger.cancelTransaction, ['ledger']);

export const useCreateTransfer = () => useLedgerMutation(ledger.createTransfer, ['ledger']);
export const useUpdateTransfer = () =>
  useLedgerMutation(
    (v: { id: string; input: Parameters<typeof ledger.updateTransfer>[1] }) =>
      ledger.updateTransfer(v.id, v.input),
    ['ledger'],
  );
export const useCompleteTransfer = () =>
  useLedgerMutation(
    (v: { id: string; transactionDate?: string }) =>
      ledger.completeTransfer(v.id, v.transactionDate),
    ['ledger'],
  );
export const useCancelTransfer = () => useLedgerMutation(ledger.cancelTransfer, ['ledger']);
