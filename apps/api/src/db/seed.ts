import { parseEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * Seeds de DESENVOLVIMENTO (dados de exemplo). Nunca executar em produção.
 * FASE 0: ainda não há tabelas de domínio — os seeds entram a partir da FASE 1/2
 * (ver database/seeds/README.md). Categorias padrão NÃO são seed: são criadas para cada
 * usuário no cadastro, pela aplicação.
 */
function main(): void {
  loadEnvFile();
  const config = parseEnv();
  if (config.NODE_ENV === 'production') {
    process.stderr.write('[seed] recusado: seeds não rodam em produção.\n');
    process.exit(1);
  }
  process.stdout.write('[seed] nada a semear na FASE 0.\n');
}

main();
