import { and, asc, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { budgets, categories } from '../../db/schema/index.js';

export interface BudgetRow {
  id: string;
  categoryId: string;
  categoryName: string;
  /** Primeiro dia do mês (AAAA-MM-01). */
  month: string;
  limitCents: number;
}

export interface CategorySpending {
  categoryId: string | null;
  spentCents: number;
  pendingCents: number;
}

export interface BudgetsRepository {
  list(userId: string, monthStart: string): Promise<BudgetRow[]>;
  /** Despesas (efetivadas e pendentes) por categoria no período. Transferências e cancelados ficam de fora. */
  spending(userId: string, from: string, to: string): Promise<CategorySpending[]>;
  /** Cria ou atualiza o limite da categoria no mês (UNIQUE user+categoria+mês). */
  upsert(
    userId: string,
    input: { categoryId: string; monthStart: string; limitCents: number },
  ): Promise<string>;
  findById(userId: string, id: string): Promise<BudgetRow | undefined>;
  remove(userId: string, id: string): Promise<boolean>;
}

const columns = {
  id: budgets.id,
  categoryId: budgets.categoryId,
  categoryName: categories.name,
  month: budgets.month,
  limitCents: budgets.limitCents,
};

export class DrizzleBudgetsRepository implements BudgetsRepository {
  constructor(private readonly db: DrizzleDb) {}

  list(userId: string, monthStart: string) {
    return this.db
      .select(columns)
      .from(budgets)
      .innerJoin(
        categories,
        and(eq(categories.id, budgets.categoryId), eq(categories.userId, budgets.userId)),
      )
      .where(and(eq(budgets.userId, userId), eq(budgets.month, monthStart)))
      .orderBy(asc(categories.name), asc(budgets.id));
  }

  async spending(userId: string, from: string, to: string) {
    const rows = await this.db.execute<{
      category_id: string | null;
      spent: string;
      pending: string;
    }>(sql`
      select category_id,
             coalesce(sum(amount_cents) filter (where status = 'completed'), 0) as spent,
             coalesce(sum(amount_cents) filter (where status = 'pending'), 0) as pending
      from transactions
      where user_id = ${userId}
        and type = 'expense'
        and status in ('completed', 'pending')
        and transaction_date between ${from}::date and ${to}::date
      group by category_id`);
    return rows.map((row) => ({
      categoryId: row.category_id,
      spentCents: Number(row.spent),
      pendingCents: Number(row.pending),
    }));
  }

  async upsert(
    userId: string,
    input: { categoryId: string; monthStart: string; limitCents: number },
  ) {
    const [row] = await this.db
      .insert(budgets)
      .values({
        userId,
        categoryId: input.categoryId,
        month: input.monthStart,
        limitCents: input.limitCents,
      })
      .onConflictDoUpdate({
        target: [budgets.userId, budgets.categoryId, budgets.month],
        set: { limitCents: input.limitCents },
      })
      .returning({ id: budgets.id });
    if (!row) throw new Error('UPSERT em budgets não retornou linha');
    return row.id;
  }

  async findById(userId: string, id: string) {
    const [row] = await this.db
      .select(columns)
      .from(budgets)
      .innerJoin(
        categories,
        and(eq(categories.id, budgets.categoryId), eq(categories.userId, budgets.userId)),
      )
      .where(and(eq(budgets.userId, userId), eq(budgets.id, id)))
      .limit(1);
    return row;
  }

  async remove(userId: string, id: string) {
    const deleted = await this.db
      .delete(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.id, id)))
      .returning({ id: budgets.id });
    return deleted.length > 0;
  }
}
