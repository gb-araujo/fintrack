import { createDatabase } from '../db/client.js';
import { runMigrations } from '../db/migrations.js';

/**
 * Antes da suíte: aplica as migrations no banco de teste (se TEST_DATABASE_URL estiver definido).
 * Os testes de integração usam dados únicos (e-mails aleatórios), então não há limpeza entre testes.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const database = createDatabase(url, { maxConnections: 1 });
  try {
    await runMigrations(database.db);
  } finally {
    await database.close();
  }
}
