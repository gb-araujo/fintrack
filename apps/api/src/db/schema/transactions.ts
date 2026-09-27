import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import {
  paymentMethodEnum,
  transactionStatusEnum,
  transactionTypeEnum,
  transferDirectionEnum,
} from './enums.js';
import { transfers } from './transfers.js';
import { users } from './users.js';

/**
 * Lançamento em uma conta. Valor sempre POSITIVO: o sentido vem do tipo (e da direção, nas
 * pernas de transferência). Só lançamentos `completed` afetam o saldo (ADR 0002).
 * Colunas de fases futuras (recorrência, fatura, importação) entram nas próprias migrations.
 */
export const transactions = pgTable(
  'transactions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: uuid().notNull(),
    categoryId: uuid(),
    type: transactionTypeEnum().notNull(),
    amountCents: bigint({ mode: 'number' }).notNull(),
    description: varchar({ length: 200 }).notNull().default(''),
    /** Data de calendário do lançamento (sem fuso). */
    transactionDate: date({ mode: 'string' }).notNull(),
    paymentMethod: paymentMethodEnum(),
    status: transactionStatusEnum().notNull().default('completed'),
    transferId: uuid(),
    transferDirection: transferDirectionEnum(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: 'transactions_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'transactions_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: 'transactions_transfer_fk',
      columns: [table.transferId, table.userId],
      foreignColumns: [transfers.id, transfers.userId],
    }),
    check('transactions_amount_positive', sql`${table.amountCents} > 0`),
    // Transferência ⇔ tem transfer_id e direção, e não tem categoria (não é receita nem despesa).
    check(
      'transactions_transfer_shape',
      sql`(${table.type} = 'transfer' and ${table.transferId} is not null and ${table.transferDirection} is not null and ${table.categoryId} is null)
        or (${table.type} <> 'transfer' and ${table.transferId} is null and ${table.transferDirection} is null)`,
    ),
    index('transactions_user_date_idx').on(table.userId, table.transactionDate),
    index('transactions_account_status_idx').on(table.accountId, table.status),
    index('transactions_transfer_idx').on(table.transferId),
  ],
);

export type TransactionRow = typeof transactions.$inferSelect;
