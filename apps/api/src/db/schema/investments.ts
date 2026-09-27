import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { createdAt, primaryId } from './columns.js';
import { users } from './users.js';

/**
 * Avaliação de uma posição de investimento: "valia X nesta data" (o que o extrato da corretora
 * mostra, conferido pelo usuário) — FASE 8, ADR 0020. NUNCA sobrescrita: cada avaliação fica para
 * sempre, para o rendimento de qualquer intervalo poder ser recalculado depois. Uma por dia por
 * conta (registrar de novo no mesmo dia corrige a anterior).
 */
export const investmentValuations = pgTable(
  'investment_valuations',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid().notNull(),
    date: date({ mode: 'string' }).notNull(),
    balanceCents: bigint({ mode: 'number' }).notNull(),
    note: varchar({ length: 200 }),
    createdAt: createdAt(),
  },
  (table) => [
    unique('investment_valuations_account_date_unique').on(table.accountId, table.date),
    foreignKey({
      name: 'investment_valuations_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    check('investment_valuations_balance_non_negative', sql`${table.balanceCents} >= 0`),
  ],
);

/** Instituição/produto de uma conta de investimento (ex.: "XP", "Tesouro Selic") — só cadastro. */
export const investmentDetails = pgTable(
  'investment_details',
  {
    accountId: uuid()
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    institution: varchar({ length: 80 }),
    product: varchar({ length: 80 }),
  },
  (table) => [
    foreignKey({
      name: 'investment_details_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
  ],
);

export type InvestmentValuationRow = typeof investmentValuations.$inferSelect;
export type InvestmentDetailsRow = typeof investmentDetails.$inferSelect;
