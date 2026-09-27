import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { transactionStatusEnum } from './enums.js';
import { users } from './users.js';

/**
 * Cabeçalho de uma transferência entre contas do mesmo usuário (ADR 0003).
 * Cada transferência tem EXATAMENTE duas pernas em `transactions` (saída na origem e entrada no
 * destino) — garantido no banco por um constraint trigger (migration 0003), não só pela aplicação.
 * Transferência não é receita nem despesa.
 */
export const transfers = pgTable(
  'transfers',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fromAccountId: uuid().notNull(),
    toAccountId: uuid().notNull(),
    amountCents: bigint({ mode: 'number' }).notNull(),
    transferDate: date({ mode: 'string' }).notNull(),
    status: transactionStatusEnum().notNull().default('completed'),
    description: varchar({ length: 200 }).notNull().default(''),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('transfers_id_user_id_unique').on(table.id, table.userId),
    foreignKey({
      name: 'transfers_from_account_fk',
      columns: [table.fromAccountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'transfers_to_account_fk',
      columns: [table.toAccountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    check('transfers_amount_positive', sql`${table.amountCents} > 0`),
    check('transfers_accounts_differ', sql`${table.fromAccountId} <> ${table.toAccountId}`),
    index('transfers_user_date_idx').on(table.userId, table.transferDate),
  ],
);

export type TransferRow = typeof transfers.$inferSelect;
