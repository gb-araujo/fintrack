import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { categories } from './categories.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { users } from './users.js';

/**
 * Orçamento mensal por categoria de despesa. Configuração (não é histórico financeiro): pode ser
 * removido. O "gasto" nunca é gravado — é calculado a partir dos lançamentos efetivados.
 */
export const budgets = pgTable(
  'budgets',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    categoryId: uuid().notNull(),
    /** Primeiro dia do mês de referência. */
    month: date({ mode: 'string' }).notNull(),
    limitCents: bigint({ mode: 'number' }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('budgets_user_category_month_unique').on(table.userId, table.categoryId, table.month),
    foreignKey({
      name: 'budgets_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('budgets_limit_positive', sql`${table.limitCents} > 0`),
    check('budgets_month_first_day', sql`extract(day from ${table.month}) = 1`),
  ],
);

export type BudgetRow = typeof budgets.$inferSelect;
