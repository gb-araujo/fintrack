import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { accounts } from './accounts.js';
import { categories } from './categories.js';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { users } from './users.js';

/**
 * Cartão de crédito (FASE 5). NÃO é uma conta: compras viram parcelas em faturas, e a fatura é paga
 * por uma conta via `card_payment` (ADR 0004). Cartões são arquivados, nunca apagados.
 */
export const creditCards = pgTable(
  'credit_cards',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 60 }).notNull(),
    limitCents: bigint({ mode: 'number' }).notNull(),
    /** Dia do fechamento da fatura (meses curtos usam o último dia). */
    closingDay: integer().notNull(),
    /** Dia do vencimento (meses curtos usam o último dia). */
    dueDay: integer().notNull(),
    /** Conta sugerida para pagar as faturas (opcional). */
    paymentAccountId: uuid(),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('credit_cards_id_user_id_unique').on(table.id, table.userId),
    uniqueIndex('credit_cards_user_name_active_unique')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
    foreignKey({
      name: 'credit_cards_payment_account_fk',
      columns: [table.paymentAccountId, table.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    check('credit_cards_limit_positive', sql`${table.limitCents} > 0`),
    check('credit_cards_closing_day_range', sql`${table.closingDay} between 1 and 31`),
    check('credit_cards_due_day_range', sql`${table.dueDay} between 1 and 31`),
  ],
);

/**
 * Fatura de um cartão. Criada quando a primeira parcela cai nela. `closing_date` e `due_date` ficam
 * gravadas (mudar o dia de fechamento do cartão não reescreve faturas existentes). O status NÃO é
 * gravado: é derivado de datas e valores (nada que possa divergir do histórico — ADR 0017).
 * `reference_month` é o mês do VENCIMENTO: é nele que as parcelas são reconhecidas como despesa.
 */
export const creditCardInvoices = pgTable(
  'credit_card_invoices',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditCardId: uuid().notNull(),
    /** Primeiro dia do mês do vencimento. */
    referenceMonth: date({ mode: 'string' }).notNull(),
    closingDate: date({ mode: 'string' }).notNull(),
    dueDate: date({ mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique('credit_card_invoices_id_user_id_unique').on(table.id, table.userId),
    unique('credit_card_invoices_id_card_user_unique').on(
      table.id,
      table.creditCardId,
      table.userId,
    ),
    unique('credit_card_invoices_card_month_unique').on(table.creditCardId, table.referenceMonth),
    foreignKey({
      name: 'credit_card_invoices_card_fk',
      columns: [table.creditCardId, table.userId],
      foreignColumns: [creditCards.id, creditCards.userId],
    }),
    // Vencimento no mesmo dia do fechamento é possível (ex.: fechamento 28 e vencimento 29 em fevereiro).
    check(
      'credit_card_invoices_due_not_before_closing',
      sql`${table.dueDate} >= ${table.closingDate}`,
    ),
    check(
      'credit_card_invoices_reference_is_due_month',
      sql`${table.referenceMonth} = date_trunc('month', ${table.dueDate})::date`,
    ),
    index('credit_card_invoices_user_due_idx').on(table.userId, table.dueDate),
  ],
);

/** Compra no cartão (`credit_card_transactions` no desenho). Cancelada, nunca apagada. */
export const creditCardTransactions = pgTable(
  'credit_card_transactions',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditCardId: uuid().notNull(),
    categoryId: uuid(),
    description: varchar({ length: 200 }).notNull(),
    purchaseDate: date({ mode: 'string' }).notNull(),
    totalAmountCents: bigint({ mode: 'number' }).notNull(),
    installmentsCount: integer().notNull(),
    /** Compra estornada/cancelada: as parcelas deixam de contar em fatura, limite e orçamento. */
    cancelledAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('credit_card_transactions_id_user_id_unique').on(table.id, table.userId),
    unique('credit_card_transactions_id_card_user_unique').on(
      table.id,
      table.creditCardId,
      table.userId,
    ),
    foreignKey({
      name: 'credit_card_transactions_card_fk',
      columns: [table.creditCardId, table.userId],
      foreignColumns: [creditCards.id, creditCards.userId],
    }),
    foreignKey({
      name: 'credit_card_transactions_category_fk',
      columns: [table.categoryId, table.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    check('credit_card_transactions_total_positive', sql`${table.totalAmountCents} > 0`),
    check(
      'credit_card_transactions_installments_range',
      sql`${table.installmentsCount} between 1 and 48`,
    ),
    index('credit_card_transactions_card_date_idx').on(table.creditCardId, table.purchaseDate),
  ],
);

/**
 * Parcela de uma compra, presa a uma fatura do MESMO cartão (as chaves compostas garantem isso no
 * banco). A soma das parcelas é sempre o total da compra (constraint trigger, migration 0006).
 */
export const creditCardInstallments = pgTable(
  'credit_card_installments',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    creditCardId: uuid().notNull(),
    cardTransactionId: uuid().notNull(),
    invoiceId: uuid().notNull(),
    installmentNumber: integer().notNull(),
    amountCents: bigint({ mode: 'number' }).notNull(),
  },
  (table) => [
    unique('credit_card_installments_purchase_number_unique').on(
      table.cardTransactionId,
      table.installmentNumber,
    ),
    foreignKey({
      name: 'credit_card_installments_purchase_fk',
      columns: [table.cardTransactionId, table.creditCardId, table.userId],
      foreignColumns: [
        creditCardTransactions.id,
        creditCardTransactions.creditCardId,
        creditCardTransactions.userId,
      ],
    }),
    foreignKey({
      name: 'credit_card_installments_invoice_fk',
      columns: [table.invoiceId, table.creditCardId, table.userId],
      foreignColumns: [
        creditCardInvoices.id,
        creditCardInvoices.creditCardId,
        creditCardInvoices.userId,
      ],
    }),
    check('credit_card_installments_amount_positive', sql`${table.amountCents} > 0`),
    check('credit_card_installments_number_positive', sql`${table.installmentNumber} >= 1`),
    index('credit_card_installments_invoice_idx').on(table.invoiceId),
  ],
);

export type CreditCardRow = typeof creditCards.$inferSelect;
export type CreditCardInvoiceRow = typeof creditCardInvoices.$inferSelect;
export type CreditCardPurchaseRow = typeof creditCardTransactions.$inferSelect;
export type CreditCardInstallmentRow = typeof creditCardInstallments.$inferSelect;
