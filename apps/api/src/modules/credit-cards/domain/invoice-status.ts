import type { InvoiceStatus } from '@fintrack/shared';

export interface InvoiceFigures {
  closingDate: string;
  dueDate: string;
  /** Σ parcelas das compras não canceladas. */
  totalCents: number;
  /** Σ pagamentos EFETIVADOS. */
  paidCents: number;
  /** Σ pagamentos pendentes (agendados). */
  scheduledCents: number;
}

export interface InvoiceState {
  status: InvoiceStatus;
  overdue: boolean;
  /** total − pago (negativo = crédito, ex.: compra estornada depois do pagamento). */
  remainingCents: number;
}

/**
 * Status da fatura, DERIVADO de datas e valores (nunca gravado — não pode divergir do histórico):
 * - `open`: ainda recebe compras (hoje ≤ fechamento);
 * - `closed`: fechada com valor em aberto;
 * - `paid`: fechada e sem nada em aberto.
 * `overdue`: passou do vencimento com valor em aberto (vale também para fatura ainda aberta).
 */
export function invoiceState(invoice: InvoiceFigures, today: string): InvoiceState {
  const remainingCents = invoice.totalCents - invoice.paidCents;
  const status: InvoiceStatus =
    today <= invoice.closingDate ? 'open' : remainingCents > 0 ? 'closed' : 'paid';
  return { status, overdue: remainingCents > 0 && today > invoice.dueDate, remainingCents };
}

/** Quanto ainda pode ser pago/agendado: o que resta menos o que já está agendado. */
export function payableCents(invoice: InvoiceFigures): number {
  return Math.max(0, invoice.totalCents - invoice.paidCents - invoice.scheduledCents);
}
