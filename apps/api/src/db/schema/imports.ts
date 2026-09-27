import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { createdAt, primaryId } from './columns.js';
import { transactions } from './transactions.js';
import { transfers } from './transfers.js';
import { users } from './users.js';

/**
 * Lote de importação de extrato (FASE 6, ADR 0018). Os itens ficam em `imported_transactions` até
 * a confirmação; só então viram lançamentos. Lotes nunca são apagados (histórico e desfazer).
 */
export const imports = pgTable(
  'imports',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Conta do extrato. */
    accountId: uuid().notNull(),
    source: varchar({ length: 10 }).notNull().default('csv'),
    filename: varchar({ length: 200 }).notNull(),
    /** review → confirmed | cancelled; confirmed → reverted. */
    status: varchar({ length: 12 }).notNull().default('review'),
    /** Como o arquivo foi lido: delimitador, cabeçalhos e colunas usadas. */
    detected: jsonb().notNull(),
    /** Linhas do arquivo que não viraram item (com o motivo) — nada é ignorado em silêncio. */
    ignoredRows: jsonb()
      .notNull()
      .default(sql`'[]'::jsonb`),
    ignoredRowsCount: integer().notNull().default(0),
    createdAt: createdAt(),
    confirmedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    unique('imports_id_user_id_unique').on(table.id, table.userId),
    foreignKey({
      name: 'imports_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    check('imports_source_valid', sql`${table.source} in ('csv', 'ofx', 'pdf')`),
    check(
      'imports_status_valid',
      sql`${table.status} in ('review', 'confirmed', 'cancelled', 'reverted')`,
    ),
    index('imports_user_created_idx').on(table.userId, table.createdAt),
  ],
);

/**
 * Linha do extrato. `fingerprint` = conta + data + valor com sinal + descrição normalizada (+ ordinal
 * entre linhas idênticas do mesmo arquivo): identifica a MESMA movimentação em importações repetidas.
 */
export const importedTransactions = pgTable(
  'imported_transactions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    importId: uuid().notNull(),
    /** Redundante com imports.account_id: permite índice direto para achar duplicatas exatas. */
    accountId: uuid().notNull(),
    rowNumber: integer().notNull(),
    /** Linha original do arquivo (colunas → valores), para conferência. */
    rawData: jsonb().notNull(),
    transactionDate: date({ mode: 'string' }).notNull(),
    amountCents: bigint({ mode: 'number' }).notNull(),
    direction: varchar({ length: 3 }).notNull(),
    description: varchar({ length: 300 }).notNull(),
    descriptionNormalized: varchar({ length: 300 }).notNull(),
    fingerprint: varchar({ length: 64 }).notNull(),
    externalId: varchar({ length: 100 }),
    suggestedType: varchar({ length: 12 }).notNull(),
    suggestedCategoryId: uuid(),
    suggestedTargetAccountId: uuid(),
    suggestedInvoiceId: uuid(),
    suggestionSource: varchar({ length: 12 }).notNull().default('none'),
    /** exact | possible | null. */
    duplicateKind: varchar({ length: 8 }),
    duplicateOfTransactionId: uuid(),
    defaultAction: varchar({ length: 6 }).notNull(),
    /** pending → imported | skipped (definido na confirmação). */
    status: varchar({ length: 8 }).notNull().default('pending'),
    createdTransactionId: uuid(),
    createdTransferId: uuid(),
    createdAt: createdAt(),
  },
  (table) => [
    unique('imported_transactions_import_row_unique').on(table.importId, table.rowNumber),
    foreignKey({
      name: 'imported_transactions_import_fk',
      columns: [table.importId, table.userId],
      foreignColumns: [imports.id, imports.userId],
    }),
    foreignKey({
      name: 'imported_transactions_account_fk',
      columns: [table.accountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'imported_transactions_category_fk',
      columns: [table.suggestedCategoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: 'imported_transactions_target_account_fk',
      columns: [table.suggestedTargetAccountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'imported_transactions_transaction_fk',
      columns: [table.createdTransactionId, table.userId],
      foreignColumns: [transactions.id, transactions.userId],
    }),
    foreignKey({
      name: 'imported_transactions_transfer_fk',
      columns: [table.createdTransferId, table.userId],
      foreignColumns: [transfers.id, transfers.userId],
    }),
    check('imported_transactions_amount_positive', sql`${table.amountCents} > 0`),
    check('imported_transactions_direction_valid', sql`${table.direction} in ('in', 'out')`),
    check(
      'imported_transactions_suggested_type_valid',
      sql`${table.suggestedType} in ('income', 'expense', 'transfer', 'card_payment')`,
    ),
    check(
      'imported_transactions_duplicate_kind_valid',
      sql`${table.duplicateKind} is null or ${table.duplicateKind} in ('exact', 'possible')`,
    ),
    check(
      'imported_transactions_default_action_valid',
      sql`${table.defaultAction} in ('import', 'skip')`,
    ),
    check(
      'imported_transactions_status_valid',
      sql`${table.status} in ('pending', 'imported', 'skipped')`,
    ),
    // Achar duplicatas exatas de importações anteriores da mesma conta.
    index('imported_transactions_fingerprint_idx').on(
      table.userId,
      table.accountId,
      table.fingerprint,
    ),
  ],
);

/**
 * Regra "descrição parecida com X → categoria/tipo/conta". Só `contains` e `starts_with`: regex
 * arbitrária de usuário abriria espaço para ReDoS (ADR 0018).
 */
export const merchantRules = pgTable(
  'merchant_rules',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Texto já normalizado (maiúsculas, sem acentos). */
    pattern: varchar({ length: 100 }).notNull(),
    matchType: varchar({ length: 12 }).notNull().default('contains'),
    suggestedType: varchar({ length: 12 }).notNull(),
    categoryId: uuid(),
    targetAccountId: uuid(),
    priority: integer().notNull().default(0),
    note: text(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: 'merchant_rules_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: 'merchant_rules_target_account_fk',
      columns: [table.targetAccountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    unique('merchant_rules_user_pattern_unique').on(table.userId, table.matchType, table.pattern),
    check(
      'merchant_rules_match_type_valid',
      sql`${table.matchType} in ('contains', 'starts_with')`,
    ),
    check(
      'merchant_rules_suggested_type_valid',
      sql`${table.suggestedType} in ('income', 'expense', 'transfer')`,
    ),
    // Transferência ⇔ tem conta de destino e não tem categoria.
    check(
      'merchant_rules_transfer_shape',
      sql`(${table.suggestedType} = 'transfer' and ${table.targetAccountId} is not null and ${table.categoryId} is null)
        or (${table.suggestedType} <> 'transfer' and ${table.targetAccountId} is null)`,
    ),
    check('merchant_rules_pattern_length', sql`char_length(${table.pattern}) between 2 and 100`),
    index('merchant_rules_user_idx').on(table.userId),
  ],
);

export type ImportRow = typeof imports.$inferSelect;
export type ImportedTransactionRow = typeof importedTransactions.$inferSelect;
export type MerchantRuleRow = typeof merchantRules.$inferSelect;
