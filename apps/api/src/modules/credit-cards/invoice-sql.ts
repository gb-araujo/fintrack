import { sql } from 'drizzle-orm';

/**
 * Colunas agregadas de uma fatura, em SQL — a ÚNICA definição de "total / pago / agendado", usada
 * pelo módulo de cartões, pelo painel e (nas próximas fases) pelos relatórios, para nunca divergirem.
 *
 * Deve ser usada dentro de um `select … from credit_card_invoices i` (alias `i`):
 * - total: Σ parcelas das compras NÃO canceladas;
 * - pago: Σ pagamentos (`card_payment`) efetivados; agendado: Σ pagamentos pendentes.
 * Cancelados nunca entram. Somas de bigint voltam como texto: converter com Number.
 */
export const invoiceFiguresSql = sql`
  coalesce((
    select sum(ci.amount_cents)
    from credit_card_installments ci
    join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
    where ci.invoice_id = i.id and ci.user_id = i.user_id and p.cancelled_at is null
  ), 0) as total_cents,
  coalesce((
    select sum(t.amount_cents) from transactions t
    where t.credit_card_invoice_id = i.id and t.user_id = i.user_id
      and t.type = 'card_payment' and t.status = 'completed'
  ), 0) as paid_cents,
  coalesce((
    select sum(t.amount_cents) from transactions t
    where t.credit_card_invoice_id = i.id and t.user_id = i.user_id
      and t.type = 'card_payment' and t.status = 'pending'
  ), 0) as scheduled_cents`;

// `type` (não interface): precisa ser atribuível a Record<string, unknown> no db.execute.
export type InvoiceFiguresRow = {
  id: string;
  credit_card_id: string;
  reference_month: string;
  closing_date: string;
  due_date: string;
  total_cents: string;
  paid_cents: string;
  scheduled_cents: string;
};

/** Colunas básicas da fatura (alias `i`), com datas como texto AAAA-MM-DD. */
export const invoiceColumnsSql = sql`
  i.id, i.credit_card_id,
  i.reference_month::text as reference_month,
  i.closing_date::text as closing_date,
  i.due_date::text as due_date`;
