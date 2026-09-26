import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Em desenvolvimento, carrega o `.env` da raiz do monorepo (se existir).
 * Variáveis já definidas no ambiente (Railway, Docker, CI) têm prioridade e não são sobrescritas.
 * Funciona tanto em `src/config` (tsx) quanto em `dist/config` (build), que têm a mesma profundidade.
 */
export function loadEnvFile(): void {
  if (process.env.NODE_ENV === 'production') return;
  const rootEnv = fileURLToPath(new URL('../../../../.env', import.meta.url));
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}
