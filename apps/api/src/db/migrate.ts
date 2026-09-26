import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { parseEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';
import { createDatabase } from './client.js';

/**
 * Aplica as migrations de database/migrations.
 * - Local:   npm run db:migrate
 * - Railway: executado como preDeployCommand (node dist/db/migrate.js) antes de cada deploy.
 * src/db e dist/db têm a mesma profundidade, então o caminho relativo vale para ambos.
 */
const migrationsFolder =
  process.env.MIGRATIONS_DIR ??
  fileURLToPath(new URL('../../../../database/migrations', import.meta.url));

async function main(): Promise<void> {
  loadEnvFile();
  const config = parseEnv();
  const database = createDatabase(config.DATABASE_URL, { maxConnections: 1 });
  try {
    process.stdout.write(`[migrate] aplicando migrations de ${migrationsFolder}\n`);
    await migrate(database.db, { migrationsFolder });
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
