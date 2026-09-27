import type { InvoicePeriod } from './domain/invoice-period.js';
import type { InvoiceFigures } from './domain/invoice-status.js';

export interface CardRecord {
  id: string;
  name: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface NewCard {
  name: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  paymentAccountId: string | null;
}

export type CardPatch = Partial<NewCard>;

/** Fatura com os valores agregados (total, pago, agendado) — o status é derivado depois. */
export interface InvoiceRecord extends InvoiceFigures {
  id: string;
  creditCardId: string;
  /** Primeiro dia do mês do vencimento ("AAAA-MM-01"). */
  referenceMonth: string;
}

export interface PurchaseInstallmentRecord {
  installmentNumber: number;
  amountCents: number;
  invoiceId: string;
  referenceMonth: string;
  dueDate: string;
}

export interface PurchaseRecord {
  id: string;
  creditCardId: string;
  description: string;
  purchaseDate: string;
  totalAmountCents: number;
  installmentsCount: number;
  categoryId: string | null;
  cancelledAt: Date | null;
  installments: PurchaseInstallmentRecord[];
  createdAt: Date;
}

export interface NewPurchase {
  description: string;
  purchaseDate: string;
  totalAmountCents: number;
  categoryId: string | null;
  /** Uma entrada por parcela, em ordem: valor e o período da fatura que a recebe. */
  installments: { amountCents: number; period: InvoicePeriod }[];
}

export interface PurchasePatch {
  description?: string;
  categoryId?: string | null;
}

export interface InvoiceInstallmentItem {
  purchaseId: string;
  description: string;
  purchaseDate: string;
  categoryId: string | null;
  installmentNumber: number;
  installmentsCount: number;
  amountCents: number;
}

export interface InvoicePaymentItem {
  id: string;
  accountId: string;
  amountCents: number;
  date: string;
  status: 'pending' | 'completed' | 'cancelled';
}

/** Pagamento decidido pelo service com a fatura TRAVADA (evita pagar o mesmo valor duas vezes). */
export interface NewPayment {
  accountId: string;
  amountCents: number;
  description: string;
  transactionDate: string;
  status: 'pending' | 'completed';
}
