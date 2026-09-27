import type { PendingBill } from '@fintrack/shared';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import {
  invoiceColumnsSql,
  invoiceFiguresSql,
  type InvoiceFiguresRow,
} from '../credit-cards/invoice-sql.js';

/** Fatura com valor em aberto (total − pago > 0), para o painel. */
export interface OutstandingInvoice {
  id: string;
  cardId: string;
  cardName: string;
  paymentAccountId: string | null;
  /** "AAAA-MM-01" */
  referenceMonth: string;
  dueDate: string;
  remainingCents: number;
}

/** Receita/despesa PENDENTE em conta líquida, com data até o horizonte. */
export interface LiquidPendingEntry {
  id: string;
  type: 'income' | 'expense';
  description: string;
  amountCents: number;
  date: string;
  accountId: string;
}

/** Transferência PENDENTE até o horizonte que cruza a fronteira líquida. */
export interface TransferCrossingEntry {
  id: string;
  /** `in` = de conta não líquida para líquida (ex.: resgate); `out` = o contrário (ex.: aplicação). */
  direction: 'in' | 'out';
  description: string;
  amountCents: number;
  date: string;
  /** A conta líquida da transferência (onde o dinheiro entra ou de onde sai). */
  accountId: string;
}

export interface DashboardRepository {
  liquidPendingEntries(userId: string, until: string): Promise<LiquidPendingEntry[]>;
  pendingTransferCrossingEntries(userId: string, until: string): Promise<TransferCrossingEntry[]>;
  /** Receitas/despesas EFETIVADAS no período (transferências não contam). */
  completedTotals(
    userId: string,
    from: string,
    to: string,
  ): Promise<{ incomeCents: number; expenseCents: number }>;
  pendingBills(
    userId: string,
    until: string,
    today: string,
    limit: number,
  ): Promise<{
    count: number;
    totalCents: number;
    overdueCount: number;
    overdueCents: number;
    next: PendingBill[];
  }>;
  /** Despesas pendentes com data DEPOIS do horizonte. */
  futureCommitments(userId: string, until: string): Promise<{ count: number; totalCents: number }>;
  /** Faturas com valor em aberto, ordenadas por vencimento (todas: vencidas, do horizonte e futuras). */
  outstandingInvoices(userId: string): Promise<OutstandingInvoice[]>;
  /** Parcelas de cartão (compras não canceladas) das faturas que vencem no mês de `monthStart`. */
  cardExpenses(userId: string, monthStart: string): Promise<number>;
}

const num = (value: unknown): number => Number(value ?? 0);

/**
 * Agregações em SQL. Todas filtram por `user_id` (e as junções também) e usam os mesmos critérios
 * de "conta líquida" do domínio (`isLiquidForAvailable`): banco/carteira, ativa, marcada como disponível.
 * Somas de bigint voltam como texto do PostgreSQL: convertidas com Number (centavos < 2^53).
 */
export class DrizzleDashboardRepository implements DashboardRepository {
  constructor(private readonly db: DrizzleDb) {}

  async liquidPendingEntries(userId: string, until: string) {
    // Só receita/despesa: `card_payment` agendado não entra (a fatura já conta pelo valor em aberto).
    const rows = await this.db.execute<{
      id: string;
      type: 'income' | 'expense';
      description: string;
      amount_cents: string;
      transaction_date: string;
      account_id: string;
    }>(sql`
      select t.id, t.type, t.description, t.amount_cents,
             t.transaction_date::text as transaction_date, t.account_id
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId}
        and t.status = 'pending'
        and t.type in ('income', 'expense')
        and t.transaction_date <= ${until}::date
        and a.archived_at is null and a.type in ('bank', 'wallet') and a.include_in_available
      order by t.transaction_date asc, t.created_at asc, t.id asc`);
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      description: row.description,
      amountCents: num(row.amount_cents),
      date: row.transaction_date,
      accountId: row.account_id,
    }));
  }

  async pendingTransferCrossingEntries(userId: string, until: string) {
    const rows = await this.db.execute<{
      id: string;
      direction: 'in' | 'out';
      description: string;
      amount_cents: string;
      transfer_date: string;
      account_id: string;
    }>(sql`
      with liquid as (
        select id, user_id, (archived_at is null and type in ('bank', 'wallet') and include_in_available) as is_liquid
        from accounts where user_id = ${userId}
      )
      select tr.id,
             case when src.is_liquid then 'out' else 'in' end as direction,
             tr.description, tr.amount_cents, tr.transfer_date::text as transfer_date,
             case when src.is_liquid then src.id else dst.id end as account_id
      from transfers tr
      join liquid src on src.id = tr.from_account_id and src.user_id = tr.user_id
      join liquid dst on dst.id = tr.to_account_id and dst.user_id = tr.user_id
      where tr.user_id = ${userId}
        and tr.status = 'pending'
        and tr.transfer_date <= ${until}::date
        and src.is_liquid <> dst.is_liquid
      order by tr.transfer_date asc, tr.created_at asc, tr.id asc`);
    return rows.map((row) => ({
      id: row.id,
      direction: row.direction,
      description: row.description,
      amountCents: num(row.amount_cents),
      date: row.transfer_date,
      accountId: row.account_id,
    }));
  }

  async completedTotals(userId: string, from: string, to: string) {
    const [row] = await this.db.execute<{ income: string; expense: string }>(sql`
      select
        coalesce(sum(amount_cents) filter (where type = 'income'), 0) as income,
        coalesce(sum(amount_cents) filter (where type = 'expense'), 0) as expense
      from transactions
      where user_id = ${userId}
        and status = 'completed'
        and transaction_date between ${from}::date and ${to}::date`);
    return { incomeCents: num(row?.income), expenseCents: num(row?.expense) };
  }

  async pendingBills(userId: string, until: string, today: string, limit: number) {
    const [totals] = await this.db.execute<{
      count: string;
      total: string;
      overdue_count: string;
      overdue_total: string;
    }>(sql`
      select
        count(*) as count,
        coalesce(sum(t.amount_cents), 0) as total,
        count(*) filter (where t.transaction_date < ${today}::date) as overdue_count,
        coalesce(sum(t.amount_cents) filter (where t.transaction_date < ${today}::date), 0) as overdue_total
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId} and t.status = 'pending' and t.type = 'expense'
        and t.transaction_date <= ${until}::date and a.archived_at is null`);

    const rows = await this.db.execute<{
      id: string;
      description: string;
      amount_cents: string;
      transaction_date: string;
      account_id: string;
      category_id: string | null;
    }>(sql`
      select t.id, t.description, t.amount_cents, t.transaction_date::text as transaction_date,
             t.account_id, t.category_id
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId} and t.status = 'pending' and t.type = 'expense'
        and t.transaction_date <= ${until}::date and a.archived_at is null
      order by t.transaction_date asc, t.created_at asc, t.id asc
      limit ${limit}`);

    return {
      count: num(totals?.count),
      totalCents: num(totals?.total),
      overdueCount: num(totals?.overdue_count),
      overdueCents: num(totals?.overdue_total),
      next: rows.map((row) => ({
        id: row.id,
        kind: 'transaction' as const,
        recurringId: null,
        invoiceId: null,
        estimated: false,
        description: row.description,
        amountCents: num(row.amount_cents),
        date: row.transaction_date,
        accountId: row.account_id,
        categoryId: row.category_id,
        overdue: row.transaction_date < today,
      })),
    };
  }

  async futureCommitments(userId: string, until: string) {
    const [row] = await this.db.execute<{ count: string; total: string }>(sql`
      select count(*) as count, coalesce(sum(t.amount_cents), 0) as total
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId} and t.status = 'pending' and t.type = 'expense'
        and t.transaction_date > ${until}::date and a.archived_at is null`);
    return { count: num(row?.count), totalCents: num(row?.total) };
  }

  async outstandingInvoices(userId: string) {
    const rows = await this.db.execute<
      InvoiceFiguresRow & { card_name: string; payment_account_id: string | null }
    >(sql`
      select * from (
        select ${invoiceColumnsSql}, c.name as card_name, c.payment_account_id, ${invoiceFiguresSql}
        from credit_card_invoices i
        join credit_cards c on c.id = i.credit_card_id and c.user_id = i.user_id
        where i.user_id = ${userId}
      ) x
      where x.total_cents - x.paid_cents > 0
      order by x.due_date asc, x.id asc`);
    return rows.map((row) => ({
      id: row.id,
      cardId: row.credit_card_id,
      cardName: row.card_name,
      paymentAccountId: row.payment_account_id,
      referenceMonth: row.reference_month,
      dueDate: row.due_date,
      remainingCents: num(row.total_cents) - num(row.paid_cents),
    }));
  }

  async cardExpenses(userId: string, monthStart: string) {
    const [row] = await this.db.execute<{ total: string }>(sql`
      select coalesce(sum(ci.amount_cents), 0) as total
      from credit_card_installments ci
      join credit_card_invoices i on i.id = ci.invoice_id and i.user_id = ci.user_id
      join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
      where ci.user_id = ${userId} and p.cancelled_at is null
        and i.reference_month = ${monthStart}::date`);
    return num(row?.total);
  }
}
