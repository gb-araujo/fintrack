import type { Cashflow, CashflowEntry } from '@fintrack/shared';

export type CashflowItem = Omit<CashflowEntry, 'balanceAfterCents'>;

/**
 * Fluxo de caixa até o horizonte (docs/financial-rules.md §4c). Função pura.
 *
 * Parte do saldo de hoje das contas líquidas e aplica cada item em ordem de data. Itens vencidos
 * (data < hoje, ainda pendentes) contam como se acontecessem hoje. No mesmo dia, entradas vêm antes
 * das saídas: dá para pagar uma conta no dia em que o dinheiro entra.
 */
export function buildCashflow(
  startBalanceCents: number,
  items: readonly CashflowItem[],
  today: string,
): Cashflow {
  const effectiveDate = (item: CashflowItem) => (item.date < today ? today : item.date);
  const sorted = [...items].sort(
    (a, b) =>
      effectiveDate(a).localeCompare(effectiveDate(b)) ||
      (a.direction === b.direction ? 0 : a.direction === 'in' ? -1 : 1) ||
      a.date.localeCompare(b.date) ||
      a.description.localeCompare(b.description) ||
      a.id.localeCompare(b.id),
  );

  let balance = startBalanceCents;
  let lowestBalanceCents = startBalanceCents;
  let lowestBalanceDate = today;
  let inCents = 0;
  let outCents = 0;

  const entries = sorted.map((item): CashflowEntry => {
    if (item.direction === 'in') {
      balance += item.amountCents;
      inCents += item.amountCents;
    } else {
      balance -= item.amountCents;
      outCents += item.amountCents;
    }
    if (balance < lowestBalanceCents) {
      lowestBalanceCents = balance;
      lowestBalanceDate = effectiveDate(item);
    }
    return { ...item, balanceAfterCents: balance };
  });

  return {
    entries,
    inCents,
    outCents,
    lowestBalanceCents,
    lowestBalanceDate,
    safeToSpendNowCents: Math.max(0, lowestBalanceCents),
  };
}
