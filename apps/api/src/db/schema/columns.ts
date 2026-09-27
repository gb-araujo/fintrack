import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Texto case-insensitive (extensão citext, criada na migration 0000). */
export const citext = customType<{ data: string }>({
  dataType() {
    return 'citext';
  },
});

export const primaryId = () => uuid().primaryKey().defaultRandom();

export const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
