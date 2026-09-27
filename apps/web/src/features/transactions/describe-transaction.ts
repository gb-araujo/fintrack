import type { Account, Category, Transaction } from '@fintrack/shared';
import { PAYMENT_METHOD_LABEL } from '../ledger/labels';

/** Título e subtítulo de um lançamento na lista (apenas apresentação). */
export function describeTransaction(
  transaction: Transaction,
  accountsById: Map<string, Account>,
  categoriesById: Map<string, Category>,
): { title: string; subtitle: string } {
  const account = accountsById.get(transaction.accountId)?.name ?? 'Conta';
  const parts: string[] = [];

  if (transaction.transfer) {
    const { direction, fromAccountId, toAccountId } = transaction.transfer;
    const other =
      accountsById.get(direction === 'out' ? toAccountId : fromAccountId)?.name ?? 'outra conta';
    const label = direction === 'out' ? `Transferência para ${other}` : `Transferência de ${other}`;
    return {
      title: transaction.description ? `${label} — ${transaction.description}` : label,
      subtitle: account,
    };
  }

  const category = transaction.categoryId
    ? categoriesById.get(transaction.categoryId)?.name
    : undefined;
  if (category) parts.push(category);
  parts.push(account);
  if (transaction.paymentMethod) parts.push(PAYMENT_METHOD_LABEL[transaction.paymentMethod]);
  return {
    title:
      transaction.description ||
      category ||
      (transaction.type === 'income' ? 'Receita' : 'Despesa'),
    subtitle: parts.join(' · '),
  };
}
