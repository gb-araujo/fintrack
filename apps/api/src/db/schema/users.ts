import { sql } from 'drizzle-orm';
import { char, check, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { citext, createdAt, primaryId, updatedAt } from './columns.js';

export const users = pgTable(
  'users',
  {
    id: primaryId(),
    /** citext: "Gabriel@x.com" e "gabriel@x.com" são o mesmo usuário. */
    email: citext().notNull().unique(),
    passwordHash: text().notNull(),
    name: varchar({ length: 100 }).notNull(),
    /** Fuso IANA usado para "hoje" e "fim do mês" nos cálculos financeiros. */
    timezone: varchar({ length: 64 }).notNull().default('America/Sao_Paulo'),
    currency: char({ length: 3 }).notNull().default('BRL'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check('users_name_not_blank', sql`char_length(trim(${table.name})) > 0`),
    check('users_currency_iso', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
