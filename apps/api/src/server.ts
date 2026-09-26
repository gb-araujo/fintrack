import { buildApp } from './app.js';
import { InvalidEnvironmentError, parseEnv } from './config/env.js';
import { loadEnvFile } from './config/load-env-file.js';
import { createDatabase } from './db/client.js';

loadEnvFile();

let config;
try {
  config = parseEnv();
} catch (error) {
  if (error instanceof InvalidEnvironmentError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const database = createDatabase(config.DATABASE_URL, { maxConnections: config.DATABASE_POOL_MAX });
const app = await buildApp({ config, database });

app.addHook('onClose', async () => {
  await database.close();
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'encerrando a API');
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error }, 'falha ao encerrar');
    process.exit(1);
  }
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.error({ err: error }, 'falha ao iniciar a API');
  await database.close();
  process.exit(1);
}
