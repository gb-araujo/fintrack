import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { DrizzleDb } from './client.js';

/**
 * Pasta database/migrations. src/db e dist/db têm a mesma profundidade,
 * então o caminho relativo vale para tsx (dev/testes) e para o build (Docker/Railway).
 */
export const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  fileURLToPath(new URL('../../../../database/migrations', import.meta.url));

export async function runMigrations(db: DrizzleDb): Promise<void> {
  await migrate(db, { migrationsFolder });
}
