import { char, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { createdAt, primaryId } from './columns.js';
import { users } from './users.js';

/**
 * Refresh tokens (ADR 0007). Guarda SOMENTE o hash SHA-256 do token — nunca o valor.
 * Uma "família" é a cadeia de rotações de uma mesma sessão (login/cadastro).
 * Sem updated_at: o único campo mutável é revoked_at (e replaced_by_id, na rotação).
 */
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: primaryId(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid().notNull(),
    /** SHA-256 em hexadecimal (64 caracteres). */
    tokenHash: char({ length: 64 }).notNull().unique('refresh_tokens_token_hash_unique'),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    /** Token emitido na rotação que substituiu este. */
    replacedById: uuid(),
    userAgent: varchar({ length: 255 }),
    createdAt: createdAt(),
  },
  (table) => [index().on(table.userId), index().on(table.familyId)],
);

export type RefreshTokenRow = typeof refreshTokens.$inferSelect;
export type NewRefreshTokenRow = typeof refreshTokens.$inferInsert;
