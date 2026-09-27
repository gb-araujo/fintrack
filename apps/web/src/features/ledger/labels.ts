import type {
  AccountType,
  PaymentMethod,
  InvoiceStatus,
  RecurrenceFrequency,
  Recurring,
  TransactionStatus,
} from '@fintrack/shared';
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

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: 'Aberta',
  closed: 'Fechada',
  paid: 'Paga',
};

export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

const FREQUENCY_UNIT: Record<RecurrenceFrequency, [string, string]> = {
  weekly: ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
  yearly: ['ano', 'anos'],
};

/** "Todo mês, dia 10" / "A cada 2 semanas" — descrição curta da regra. */
export function describeRecurrence(rule: Pick<Recurring, 'frequency' | 'interval' | 'dayOfMonth'>) {
  const [singular, plural] = FREQUENCY_UNIT[rule.frequency];
  const every = rule.interval === 1 ? `Todo ${singular}` : `A cada ${rule.interval} ${plural}`;
  return rule.frequency === 'monthly' && rule.dayOfMonth
    ? `${every}, dia ${rule.dayOfMonth}`
    : every;
}

/** "2026-09" → "setembro de 2026". */
export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const name = new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('pt-BR', {
    month: 'long',
    timeZone: 'UTC',
  });
  return `${name} de ${year}`;
}

/** Soma `delta` meses a "AAAA-MM" (aritmética de calendário, sem fuso). */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
