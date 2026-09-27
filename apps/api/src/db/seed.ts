import { parseDatabaseEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * Seeds de DESENVOLVIMENTO (dados de exemplo). Nunca executar em produção.
 * FASE 1: o único dado de domínio é o usuário, criado pelo cadastro (POST /api/v1/auth/register).
 * Seeds de contas/transações de exemplo entram a partir da FASE 2 (ver database/seeds/README.md).
 */
function main(): void {
  loadEnvFile();
  const { NODE_ENV } = parseDatabaseEnv();
  if (NODE_ENV === 'production') {
    process.stderr.write('[seed] recusado: seeds não rodam em produção.\n');
    process.exit(1);
  }
  process.stdout.write('[seed] nada a semear na FASE 1 (crie um usuário pelo cadastro).\n');
}

main();
