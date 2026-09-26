import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

export interface DatabaseConnection {
  db: DrizzleDb;
  /** Verifica se o banco responde (usado pelo /health). */
  ping(): Promise<void>;
  close(): Promise<void>;
}

export interface DatabaseOptions {
  maxConnections?: number;
}

export function createDatabase(url: string, options: DatabaseOptions = {}): DatabaseConnection {
  const sql = postgres(url, {
    max: options.maxConnections ?? 10,
    connect_timeout: 10,
    idle_timeout: 30,
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema, casing: 'snake_case' });

  return {
    db,
    async ping() {
      await sql`select 1`;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
