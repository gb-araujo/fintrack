import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { creditCardInvoices } from './credit-cards.js';
import {
  paymentMethodEnum,
  transactionStatusEnum,
  transactionTypeEnum,
  transferDirectionEnum,
} from './enums.js';
import { recurringTransactions } from './recurring.js';
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
    /** Ocorrência de recorrência que originou (ou pulou) este lançamento — FASE 4. */
    recurringTransactionId: uuid(),
    occurrenceDate: date({ mode: 'string' }),
    /** Fatura paga por este lançamento — só em `card_payment` (FASE 5, ADR 0004). */
    creditCardInvoiceId: uuid(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Permite chaves compostas (id, user_id) apontando para o lançamento (ex.: importações).
    unique('transactions_id_user_id_unique').on(table.id, table.userId),
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
    foreignKey({
      name: 'transactions_recurring_fk',
      columns: [table.recurringTransactionId, table.userId],
      foreignColumns: [recurringTransactions.id, recurringTransactions.userId],
    }),
    foreignKey({
      name: 'transactions_invoice_fk',
      columns: [table.creditCardInvoiceId, table.userId],
      foreignColumns: [creditCardInvoices.id, creditCardInvoices.userId],
    }),
    // Pagamento de fatura ⇔ referencia a fatura; não tem categoria (não é despesa) nem é perna.
    check(
      'transactions_card_payment_shape',
      sql`(${table.type} = 'card_payment' and ${table.creditCardInvoiceId} is not null and ${table.categoryId} is null)
        or (${table.type} <> 'card_payment' and ${table.creditCardInvoiceId} is null)`,
    ),
    index('transactions_invoice_idx').on(table.creditCardInvoiceId),
    // recurring_transaction_id e occurrence_date andam juntos, e só em receita/despesa.
    check(
      'transactions_recurring_shape',
      sql`(${table.recurringTransactionId} is null and ${table.occurrenceDate} is null)
        or (${table.recurringTransactionId} is not null and ${table.occurrenceDate} is not null and ${table.type} in ('income', 'expense'))`,
    ),
    // Cada ocorrência vira no máximo UM lançamento (confirmado ou pulado): sem confirmação em dobro.
    uniqueIndex('transactions_recurring_occurrence_unique')
      .on(table.recurringTransactionId, table.occurrenceDate)
      .where(sql`${table.recurringTransactionId} is not null`),
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
