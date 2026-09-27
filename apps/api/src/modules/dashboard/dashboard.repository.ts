import type { PendingBill } from '@fintrack/shared';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';

export interface DashboardRepository {
  /** Receitas/despesas PENDENTES em contas líquidas, com data até o horizonte. */
  liquidPending(
    userId: string,
    until: string,
  ): Promise<{ incomeCents: number; expenseCents: number }>;
  /** Transferências PENDENTES até o horizonte que cruzam a fronteira líquida. */
  pendingTransferCrossings(
    userId: string,
    until: string,
  ): Promise<{ inCents: number; outCents: number }>;
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
}

const num = (value: unknown): number => Number(value ?? 0);

/**
 * Agregações em SQL. Todas filtram por `user_id` (e as junções também) e usam os mesmos critérios
 * de "conta líquida" do domínio (`isLiquidForAvailable`): banco/carteira, ativa, marcada como disponível.
 * Somas de bigint voltam como texto do PostgreSQL: convertidas com Number (centavos < 2^53).
 */
export class DrizzleDashboardRepository implements DashboardRepository {
  constructor(private readonly db: DrizzleDb) {}

  async liquidPending(userId: string, until: string) {
    const [row] = await this.db.execute<{ income: string; expense: string }>(sql`
      select
        coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0) as income,
        coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0) as expense
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId}
        and t.status = 'pending'
        and t.transaction_date <= ${until}::date
        and a.archived_at is null and a.type in ('bank', 'wallet') and a.include_in_available`);
    return { incomeCents: num(row?.income), expenseCents: num(row?.expense) };
  }

  async pendingTransferCrossings(userId: string, until: string) {
    const [row] = await this.db.execute<{ outgoing: string; incoming: string }>(sql`
      with liquid as (
        select id, user_id, (archived_at is null and type in ('bank', 'wallet') and include_in_available) as is_liquid
        from accounts where user_id = ${userId}
      )
      select
        coalesce(sum(tr.amount_cents) filter (where src.is_liquid and not dst.is_liquid), 0) as outgoing,
        coalesce(sum(tr.amount_cents) filter (where not src.is_liquid and dst.is_liquid), 0) as incoming
      from transfers tr
      join liquid src on src.id = tr.from_account_id and src.user_id = tr.user_id
      join liquid dst on dst.id = tr.to_account_id and dst.user_id = tr.user_id
      where tr.user_id = ${userId}
        and tr.status = 'pending'
        and tr.transfer_date <= ${until}::date`);
    return { inCents: num(row?.incoming), outCents: num(row?.outgoing) };
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
}
