import { sql, type SQL } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';

const num = (value: unknown): number => Number(value ?? 0);

/** Efeito de um lançamento no saldo da conta — a mesma regra de `balanceEffect`/`completedEffectSql`. */
const effectSql = sql`case
  when t.type = 'income' then t.amount_cents
  when t.type = 'transfer' and t.transfer_direction = 'in' then t.amount_cents
  else -t.amount_cents
end`;

/** Conta "líquida": a mesma definição de `isLiquidForAvailable` (banco/carteira, ativa, disponível). */
const liquidAccountSql = sql`a.archived_at is null and a.type in ('bank', 'wallet') and a.include_in_available`;

export interface CategoryExpenseRow {
  categoryId: string | null;
  accountCents: number;
  cardCents: number;
}

export interface MonthRow {
  month: string;
  incomeCents: number;
  accountExpenseCents: number;
  cardExpenseCents: number;
}

export interface CashFlowMovements {
  incomeCents: number;
  expensesCents: number;
  cardPaymentsCents: number;
  transfersOutCents: number;
  transfersInCents: number;
}

export interface BalancePoint {
  date: string;
  cashCents: number;
  investmentsCents: number;
  cardLiabilitiesCents: number;
}

export interface InvestmentRow {
  accountId: string;
  accountName: string;
  balanceCents: number;
  appliedCents: number;
  redeemedCents: number;
  netContributedCents: number;
  /** Rendimento no período; null quando a conta não tem NENHUMA avaliação registrada (ADR 0020). */
  yieldCents: number | null;
}

/**
 * Consultas dos relatórios. TODAS filtram por `user_id` (inclusive nas junções) e reutilizam as
 * definições financeiras do sistema: despesa efetivada em conta + parcelas de cartão reconhecidas
 * no mês do VENCIMENTO da fatura (compras canceladas fora); transferências, pagamentos de fatura e
 * cancelados nunca são despesa. Somas de bigint voltam como texto: convertidas com Number.
 */
export class ReportsRepository {
  constructor(private readonly db: DrizzleDb) {}

  async expensesByCategory(
    userId: string,
    from: string,
    to: string,
  ): Promise<CategoryExpenseRow[]> {
    const rows = await this.db.execute<{
      category_id: string | null;
      account_cents: string;
      card_cents: string;
    }>(sql`
      select category_id, sum(account_cents) as account_cents, sum(card_cents) as card_cents
      from (
        select t.category_id, sum(t.amount_cents) as account_cents, 0 as card_cents
        from transactions t
        where t.user_id = ${userId} and t.type = 'expense' and t.status = 'completed'
          and t.transaction_date between ${from}::date and ${to}::date
        group by t.category_id
        union all
        select p.category_id, 0 as account_cents, sum(ci.amount_cents) as card_cents
        from credit_card_installments ci
        join credit_card_invoices i on i.id = ci.invoice_id and i.user_id = ci.user_id
        join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
        where ci.user_id = ${userId} and p.cancelled_at is null
          and i.due_date between ${from}::date and ${to}::date
        group by p.category_id
      ) u
      group by category_id`);
    return rows.map((row) => ({
      categoryId: row.category_id,
      accountCents: num(row.account_cents),
      cardCents: num(row.card_cents),
    }));
  }

  async incomeExpenseTotals(userId: string, from: string, to: string) {
    const [row] = await this.db.execute<{
      income: string;
      account_expense: string;
      card_expense: string;
    }>(sql`
      select
        coalesce((select sum(t.amount_cents) from transactions t
          where t.user_id = ${userId} and t.type = 'income' and t.status = 'completed'
            and t.transaction_date between ${from}::date and ${to}::date), 0) as income,
        coalesce((select sum(t.amount_cents) from transactions t
          where t.user_id = ${userId} and t.type = 'expense' and t.status = 'completed'
            and t.transaction_date between ${from}::date and ${to}::date), 0) as account_expense,
        coalesce((select sum(ci.amount_cents)
          from credit_card_installments ci
          join credit_card_invoices i on i.id = ci.invoice_id and i.user_id = ci.user_id
          join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
          where ci.user_id = ${userId} and p.cancelled_at is null
            and i.due_date between ${from}::date and ${to}::date), 0) as card_expense`);
    return {
      incomeCents: num(row?.income),
      accountExpenseCents: num(row?.account_expense),
      cardExpenseCents: num(row?.card_expense),
    };
  }

  /** Série por mês (AAAA-MM). `from` e `to` são o primeiro e o último dia do intervalo de meses. */
  async monthlySeries(userId: string, from: string, to: string): Promise<MonthRow[]> {
    const rows = await this.db.execute<{
      month: string;
      income: string;
      account_expense: string;
      card_expense: string;
    }>(sql`
      select month, sum(income) as income, sum(account_expense) as account_expense,
             sum(card_expense) as card_expense
      from (
        select to_char(t.transaction_date, 'YYYY-MM') as month,
               case when t.type = 'income' then t.amount_cents else 0 end as income,
               case when t.type = 'expense' then t.amount_cents else 0 end as account_expense,
               0 as card_expense
        from transactions t
        where t.user_id = ${userId} and t.status = 'completed' and t.type in ('income', 'expense')
          and t.transaction_date between ${from}::date and ${to}::date
        union all
        select to_char(i.reference_month, 'YYYY-MM') as month, 0, 0, ci.amount_cents
        from credit_card_installments ci
        join credit_card_invoices i on i.id = ci.invoice_id and i.user_id = ci.user_id
        join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
        where ci.user_id = ${userId} and p.cancelled_at is null
          and i.reference_month between ${from}::date and ${to}::date
      ) u
      group by month
      order by month`);
    return rows.map((row) => ({
      month: row.month,
      incomeCents: num(row.income),
      accountExpenseCents: num(row.account_expense),
      cardExpenseCents: num(row.card_expense),
    }));
  }

  async expensesByAccount(userId: string, from: string, to: string) {
    const rows = await this.db.execute<{ account_id: string; name: string; total: string }>(sql`
      select a.id as account_id, a.name, sum(t.amount_cents) as total
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      where t.user_id = ${userId} and t.type = 'expense' and t.status = 'completed'
        and t.transaction_date between ${from}::date and ${to}::date
      group by a.id, a.name
      order by total desc, a.name asc`);
    return rows.map((row) => ({
      accountId: row.account_id,
      accountName: row.name,
      totalCents: num(row.total),
    }));
  }

  async expensesByCard(userId: string, from: string, to: string) {
    const rows = await this.db.execute<{
      id: string;
      name: string;
      installments: string;
      purchased: string;
    }>(sql`
      select c.id, c.name,
        coalesce((select sum(ci.amount_cents)
          from credit_card_installments ci
          join credit_card_invoices i on i.id = ci.invoice_id and i.user_id = ci.user_id
          join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
          where ci.credit_card_id = c.id and ci.user_id = c.user_id and p.cancelled_at is null
            and i.due_date between ${from}::date and ${to}::date), 0) as installments,
        coalesce((select sum(p.total_amount_cents)
          from credit_card_transactions p
          where p.credit_card_id = c.id and p.user_id = c.user_id and p.cancelled_at is null
            and p.purchase_date between ${from}::date and ${to}::date), 0) as purchased
      from credit_cards c
      where c.user_id = ${userId}
      order by c.created_at asc, c.id asc`);
    return rows.map((row) => ({
      cardId: row.id,
      cardName: row.name,
      installmentsCents: num(row.installments),
      purchasedCents: num(row.purchased),
    }));
  }

  /** Saldo das contas líquidas ao FIM do dia `date` (saldo inicial + efetivados até a data). */
  async liquidBalanceAt(userId: string, date: string): Promise<number> {
    const [row] = await this.db.execute<{ balance: string }>(sql`
      select coalesce(sum(a.initial_balance_cents + coalesce(e.effect, 0)), 0) as balance
      from accounts a
      left join lateral (
        select sum(${effectSql}) as effect
        from transactions t
        where t.user_id = a.user_id and t.account_id = a.id and t.status = 'completed'
          and t.transaction_date <= ${date}::date
      ) e on true
      where a.user_id = ${userId} and ${liquidAccountSql}`);
    return num(row?.balance);
  }

  /**
   * Movimentos das contas líquidas no período. Transferência só conta quando cruza a fronteira
   * líquida (a outra conta não é líquida); entre duas contas líquidas o efeito é zero e ela fica de fora.
   */
  async cashFlowMovements(userId: string, from: string, to: string): Promise<CashFlowMovements> {
    const [row] = await this.db.execute<{
      income: string;
      expenses: string;
      card_payments: string;
      transfers_out: string;
      transfers_in: string;
    }>(sql`
      select
        coalesce(sum(t.amount_cents) filter (where t.type = 'income'), 0) as income,
        coalesce(sum(t.amount_cents) filter (where t.type = 'expense'), 0) as expenses,
        coalesce(sum(t.amount_cents) filter (where t.type = 'card_payment'), 0) as card_payments,
        coalesce(sum(t.amount_cents) filter (
          where t.type = 'transfer' and t.transfer_direction = 'out' and not coalesce(o.is_liquid, false)), 0) as transfers_out,
        coalesce(sum(t.amount_cents) filter (
          where t.type = 'transfer' and t.transfer_direction = 'in' and not coalesce(o.is_liquid, false)), 0) as transfers_in
      from transactions t
      join accounts a on a.id = t.account_id and a.user_id = t.user_id
      left join transfers tr on tr.id = t.transfer_id and tr.user_id = t.user_id
      left join (
        select id, user_id,
               (archived_at is null and type in ('bank', 'wallet') and include_in_available) as is_liquid
        from accounts
      ) o on o.user_id = t.user_id
         and o.id = case when t.transfer_direction = 'out' then tr.to_account_id else tr.from_account_id end
      where t.user_id = ${userId} and t.status = 'completed'
        and t.transaction_date between ${from}::date and ${to}::date
        and ${liquidAccountSql}`);
    return {
      incomeCents: num(row?.income),
      expensesCents: num(row?.expenses),
      cardPaymentsCents: num(row?.card_payments),
      transfersOutCents: num(row?.transfers_out),
      transfersInCents: num(row?.transfers_in),
    };
  }

  /**
   * Patrimônio em cada data: caixa (banco/carteira) + investimentos das contas ativas − o que se devia
   * nos cartões. A dívida por fatura usa a MESMA regra do painel (fatura a fatura, sem crédito).
   */
  async balancesAt(userId: string, dates: string[]): Promise<BalancePoint[]> {
    if (dates.length === 0) return [];
    const list = sql.join(
      dates.map((date) => sql`${date}::date`),
      sql`, `,
    );
    const balances = await this.db.execute<{ day: string; type: string; balance: string }>(sql`
      select d.day::text as day, a.type::text as type,
             sum(coalesce(v.balance_cents, a.initial_balance_cents) + coalesce(e.effect, 0)) as balance
      from unnest(array[${list}]) as d(day)
      cross join accounts a
      left join lateral (
        select balance_cents, date
        from investment_valuations
        where account_id = a.id and user_id = a.user_id and a.type = 'investment' and date <= d.day
        order by date desc
        limit 1
      ) v on true
      left join lateral (
        select sum(${effectSql}) as effect
        from transactions t
        where t.user_id = a.user_id and t.account_id = a.id and t.status = 'completed'
          and t.transaction_date <= d.day
          and (v.date is null or t.transaction_date > v.date)
      ) e on true
      where a.user_id = ${userId} and a.archived_at is null
      group by d.day, a.type`);

    const liabilities = await this.db.execute<{ day: string; liability: string }>(sql`
      select d.day::text as day, coalesce(sum(greatest(0, inv.total - inv.paid)), 0) as liability
      from unnest(array[${list}]) as d(day)
      cross join lateral (
        select
          coalesce((select sum(ci.amount_cents)
            from credit_card_installments ci
            join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
            where ci.invoice_id = i.id and ci.user_id = i.user_id
              and p.purchase_date <= d.day
              and (p.cancelled_at is null or p.cancelled_at::date > d.day)), 0) as total,
          coalesce((select sum(t.amount_cents) from transactions t
            where t.credit_card_invoice_id = i.id and t.user_id = i.user_id
              and t.type = 'card_payment' and t.status = 'completed'
              and t.transaction_date <= d.day), 0) as paid
        from credit_card_invoices i
        where i.user_id = ${userId}
      ) inv
      group by d.day`);

    return dates.map((date) => {
      const rows = balances.filter((row) => row.day === date);
      const cash = rows
        .filter((row) => row.type !== 'investment')
        .reduce((total, row) => total + num(row.balance), 0);
      const investments = rows
        .filter((row) => row.type === 'investment')
        .reduce((total, row) => total + num(row.balance), 0);
      const liability = num(liabilities.find((row) => row.day === date)?.liability);
      return {
        date,
        cashCents: cash,
        investmentsCents: investments,
        cardLiabilitiesCents: liability,
      };
    });
  }

  async investmentAccounts(userId: string, from: string, to: string): Promise<InvestmentRow[]> {
    const flow = (direction: SQL, bounded: boolean) => sql`coalesce((
      select sum(t.amount_cents) from transactions t
      where t.account_id = a.id and t.user_id = a.user_id and t.status = 'completed'
        and t.type = 'transfer' and t.transfer_direction = ${direction}
        ${bounded ? sql`and t.transaction_date between ${from}::date and ${to}::date` : sql``}
    ), 0)`;
    /**
     * "Saldo como se fosse no dia `dateExpr`" (mesma regra de `balancesAt`/`AccountsRepository`):
     * a avaliação mais recente até aquela data (ou o saldo inicial, sem avaliação) + o efeito dos
     * lançamentos efetivados depois dela até a mesma data.
     */
    const balanceAsOf = (dateExpr: SQL) => sql`(
      coalesce((
        select balance_cents from investment_valuations
        where account_id = a.id and user_id = a.user_id and date <= ${dateExpr}
        order by date desc limit 1
      ), a.initial_balance_cents) + coalesce((
        select sum(${effectSql}) from transactions t
        where t.account_id = a.id and t.user_id = a.user_id and t.status = 'completed'
          and t.transaction_date <= ${dateExpr}
          and t.transaction_date > coalesce((
            select date from investment_valuations
            where account_id = a.id and user_id = a.user_id and date <= ${dateExpr}
            order by date desc limit 1
          ), '-infinity'::date)
      ), 0)
    )`;
    const rows = await this.db.execute<{
      id: string;
      name: string;
      balance: string;
      applied: string;
      redeemed: string;
      total_applied: string;
      total_redeemed: string;
      has_valuation: boolean;
      start_balance: string;
      end_balance: string;
    }>(sql`
      select a.id, a.name,
        ${balanceAsOf(sql`current_date`)} as balance,
        ${flow(sql`'in'`, true)} as applied,
        ${flow(sql`'out'`, true)} as redeemed,
        ${flow(sql`'in'`, false)} as total_applied,
        ${flow(sql`'out'`, false)} as total_redeemed,
        exists(
          select 1 from investment_valuations where account_id = a.id and user_id = a.user_id
        ) as has_valuation,
        ${balanceAsOf(sql`${from}::date - 1`)} as start_balance,
        ${balanceAsOf(sql`${to}::date`)} as end_balance
      from accounts a
      where a.user_id = ${userId} and a.type = 'investment' and a.archived_at is null
      order by a.created_at asc, a.id asc`);
    return rows.map((row) => {
      const applied = num(row.applied);
      const redeemed = num(row.redeemed);
      return {
        accountId: row.id,
        accountName: row.name,
        balanceCents: num(row.balance),
        appliedCents: applied,
        redeemedCents: redeemed,
        netContributedCents: num(row.total_applied) - num(row.total_redeemed),
        // Sem NENHUMA avaliação, o "rendimento" seria sempre 0 (nada além de aportes) — mais
        // honesto dizer "desconhecido" do que sugerir que a posição não rendeu nada (ADR 0020).
        yieldCents: row.has_valuation
          ? num(row.end_balance) - num(row.start_balance) - (applied - redeemed)
          : null,
      };
    });
  }
}
