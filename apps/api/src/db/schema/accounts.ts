import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { accountTypeEnum } from './enums.js';
import { users } from './users.js';

/**
 * Conta = uma fonte de dinheiro (Banco Inter, Mercado Pago, Dinheiro, Investimentos).
 * Não existe coluna de saldo: o saldo é calculado a partir dos lançamentos (ADR 0002).
 * Contas são arquivadas, nunca apagadas: o histórico de lançamentos permanece.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 60 }).notNull(),
    type: accountTypeEnum().notNull(),
    /** Saldo antes de qualquer lançamento; pode ser negativo (cheque especial). */
    initialBalanceCents: bigint({ mode: 'number' }).notNull().default(0),
    /** Entra no cálculo de "dinheiro disponível" (FASE 3). Investimentos não entram por padrão. */
    includeInAvailable: boolean().notNull().default(true),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Permite chaves estrangeiras compostas (id, user_id): o banco impede que um lançamento
    // aponte para a conta de outro usuário, mesmo que haja um bug na aplicação.
    unique('accounts_id_user_id_unique').on(table.id, table.userId),
    // Nome único por usuário entre contas ativas (sem diferenciar maiúsculas).
    uniqueIndex('accounts_user_name_active_unique')
      .on(table.userId, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
