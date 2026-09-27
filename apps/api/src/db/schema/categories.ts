import { sql } from 'drizzle-orm';
import {
  boolean,
  pgTable,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { createdAt, primaryId, updatedAt } from './columns.js';
import { categoryKindEnum } from './enums.js';
import { users } from './users.js';

export const categories = pgTable(
  'categories',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar({ length: 50 }).notNull(),
    kind: categoryKindEnum().notNull(),
    /** Criada automaticamente no cadastro. Pode ser renomeada ou arquivada como qualquer outra. */
    isDefault: boolean().notNull().default(false),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique('categories_id_user_id_unique').on(table.id, table.userId),
    uniqueIndex('categories_user_kind_name_active_unique')
      .on(table.userId, table.kind, sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} is null`),
  ],
);

export type CategoryRow = typeof categories.$inferSelect;
