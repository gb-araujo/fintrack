import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as cards from '../../services/cards';
import { invalidateLedger } from '../ledger/queries';

export function useCards(includeArchived = false) {
  return useQuery({
    queryKey: ['cards', 'list', { includeArchived }],
    queryFn: ({ signal }) => cards.listCards(includeArchived, signal),
    select: (data) => data.items,
  });
}

export function useCard(id: string) {
  return useQuery({
    queryKey: ['cards', 'detail', id],
    queryFn: ({ signal }) => cards.getCard(id, signal),
  });
}

export function usePurchases(cardId: string) {
  return useQuery({
    queryKey: ['cards', 'purchases', cardId],
    queryFn: ({ signal }) => cards.listPurchases(cardId, signal),
    select: (data) => data.items,
  });
}

export function useInvoices(cardId: string) {
  return useQuery({
    queryKey: ['cards', 'invoices', cardId],
    queryFn: ({ signal }) => cards.listInvoices(cardId, signal),
    select: (data) => data.items,
  });
}

export function useInvoice(id: string | null) {
  return useQuery({
    queryKey: ['cards', 'invoice', id],
    queryFn: ({ signal }) => cards.getInvoice(id as string, signal),
    enabled: id !== null,
  });
}

/**
 * Cartão, compras e pagamentos mexem em faturas, limite, painel, orçamento e (pagamento) saldos:
 * invalida tudo que depende deles — os números vêm sempre do backend.
 */
function useCardMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const client = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => invalidateLedger(client) });
}

export const useCreateCard = () => useCardMutation(cards.createCard);
export const useUpdateCard = () =>
  useCardMutation((v: { id: string; input: Parameters<typeof cards.updateCard>[1] }) =>
    cards.updateCard(v.id, v.input),
  );
export const useArchiveCard = () =>
  useCardMutation((v: { id: string; archived: boolean }) =>
    cards.setCardArchived(v.id, v.archived),
  );
export const useCreatePurchase = () =>
  useCardMutation((v: { cardId: string; input: Parameters<typeof cards.createPurchase>[1] }) =>
    cards.createPurchase(v.cardId, v.input),
  );
export const useCancelPurchase = () => useCardMutation(cards.cancelPurchase);
export const usePayInvoice = () =>
  useCardMutation((v: { id: string; input: Parameters<typeof cards.payInvoice>[1] }) =>
    cards.payInvoice(v.id, v.input),
  );
