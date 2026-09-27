import type { TransactionStatus, TransactionType, TransferDirection } from '@fintrack/shared';

/**
 * Regras de saldo (docs/financial-rules.md §3, ADR 0002).
 *
 * O saldo de uma conta é: saldo inicial + Σ efeito dos lançamentos EFETIVADOS (`completed`).
 * Lançamentos pendentes (previsões) e cancelados nunca alteram o saldo.
 *
 * Esta função é a ESPECIFICAÇÃO do efeito de cada lançamento. A mesma regra existe em SQL
 * (db/expressions.ts) para o cálculo em lote; um teste de propriedade garante que as duas
 * concordam em qualquer sequência de lançamentos.
 */
export interface BalanceEntry {
  type: TransactionType;
  transferDirection: TransferDirection | null;
  amountCents: number;
  status: TransactionStatus;
}

/** +1 quando o lançamento entra dinheiro na conta, −1 quando sai. */
export function entrySign(entry: Pick<BalanceEntry, 'type' | 'transferDirection'>): 1 | -1 {
  switch (entry.type) {
    case 'income':
      return 1;
    case 'transfer':
      return entry.transferDirection === 'in' ? 1 : -1;
    case 'expense':
    case 'card_payment':
      return -1;
  }
}

/** Efeito do lançamento no saldo da conta, em centavos com sinal. Zero se não efetivado. */
export function balanceEffect(entry: BalanceEntry): number {
  if (entry.status !== 'completed') return 0;
  return entrySign(entry) * entry.amountCents;
}

export function computeBalance(
  initialBalanceCents: number,
  entries: readonly BalanceEntry[],
): number {
  return entries.reduce((balance, entry) => balance + balanceEffect(entry), initialBalanceCents);
}
