import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  pgEnum,
  pgTable,
  smallint,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { RECURRENCE_FREQUENCIES } from '@fintrack/shared';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { users } from './users.js';

export const recurrenceFrequencyEnum = pgEnum('recurrence_frequency', RECURRENCE_FREQUENCIES);

/**
 * Regra de recorrência (ADR 0008). Gera PREVISÕES (ocorrências virtuais calculadas sob demanda);
 * só vira lançamento quando confirmada. Nunca é apagada: fica inativa.
 * Uma ocorrência confirmada/pulada aponta para esta regra em `transactions`
 * (recurring_transaction_id + occurrence_date, UNIQUE): impossível confirmar duas vezes.
 */
export const recurringTransactions = pgTable(
  'recurring_transactions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 80 }).notNull(),
    /** 'income' | 'expense' (mesmos valores de transactions.type). */
    type: varchar({ length: 10 }).notNull(),
    /** Valor fixo ou estimativa (quando variável). Nulo = sem estimativa. */
    amountCents: bigint({ mode: 'number' }),
    isVariableAmount: boolean().notNull().default(false),
    accountId: uuid().notNull(),
    categoryId: uuid(),
    frequency: recurrenceFrequencyEnum().notNull(),
    interval: smallint().notNull().default(1),
    dayOfMonth: smallint(),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }),
    autoConfirm: boolean().notNull().default(false),
    includeInForecast: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('recurring_transactions_id_user_id_unique').on(table.id, table.userId),
    foreignKey({
      name: 'recurring_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'recurring_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('recurring_type_valid', sql`${table.type} in ('income', 'expense')`),
    check('recurring_interval_positive', sql`${table.interval} >= 1`),
    check(
      'recurring_day_of_month_range',
      sql`${table.dayOfMonth} is null or (${table.dayOfMonth} between 1 and 31)`,
    ),
    check(
      'recurring_monthly_needs_day',
      sql`${table.frequency} <> 'monthly' or ${table.dayOfMonth} is not null`,
    ),
    check(
      'recurring_amount_positive',
      sql`${table.amountCents} is null or ${table.amountCents} > 0`,
    ),
    check(
      'recurring_fixed_needs_amount',
      sql`${table.isVariableAmount} or ${table.amountCents} is not null`,
    ),
    check(
      'recurring_end_after_start',
      sql`${table.endDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    check(
      'recurring_auto_confirm_fixed_only',
      sql`not ${table.autoConfirm} or not ${table.isVariableAmount}`,
    ),
  ],
);

export type RecurringRow = typeof recurringTransactions.$inferSelect;
