import { parseDatabaseEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';
import { createDatabase } from './client.js';
import { migrationsFolder, runMigrations } from './migrations.js';

/**
 * Aplica as migrations de database/migrations.
 * - Local:   npm run db:migrate
 * - Railway: executado como preDeployCommand (node dist/db/migrate.js) antes de cada deploy.
 * Precisa apenas de DATABASE_URL.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const { DATABASE_URL } = parseDatabaseEnv();
  const database = createDatabase(DATABASE_URL, { maxConnections: 1 });
  try {
    process.stdout.write(`[migrate] aplicando migrations de ${migrationsFolder}\n`);
    await runMigrations(database.db);
    process.stdout.write('[migrate] concluído\n');
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `[migrate] falhou: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
