import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit gera as migrations SQL a partir de src/db/schema em database/migrations.
 * A aplicação das migrations é feita por src/db/migrate.ts (local e Railway).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: '../../database/migrations',
  casing: 'snake_case',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://fintrack:fintrack@localhost:5432/fintrack',
  },
});
