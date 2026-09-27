import type { AccountType, PaymentMethod, TransactionStatus } from '@fintrack/shared';
import { formatBRL } from '@fintrack/shared';

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: 'Conta bancária',
  wallet: 'Carteira',
  investment: 'Investimento',
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: 'Pix',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  other: 'Outro',
};

export const STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: 'Pendente',
  completed: 'Efetivado',
  cancelled: 'Cancelado',
};

/** Cor do valor: positivo verde, negativo vermelho, zero neutro. Apenas apresentação. */
export function amountTone(cents: number): string {
  if (cents > 0) return 'text-emerald-700';
  if (cents < 0) return 'text-rose-600';
  return 'text-slate-700';
}

/** "+R$ 10,00" / "−R$ 10,00": o sinal é sempre explícito em listas de lançamentos. */
export function formatSigned(cents: number): string {
  if (cents === 0) return formatBRL(0);
  return `${cents > 0 ? '+' : '−'}${formatBRL(Math.abs(cents))}`;
}

/** "27/09/2026" a partir de "2026-09-27" (sem passar por Date: não sofre com fuso). */
export function formatDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
