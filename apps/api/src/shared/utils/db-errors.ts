/** Código SQLSTATE do PostgreSQL para violação de UNIQUE. */
const UNIQUE_VIOLATION = '23505';

/**
 * Detecta violação de unicidade. O Drizzle encapsula o erro do driver em `cause`,
 * por isso a verificação percorre a cadeia de causas.
 */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth++) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === UNIQUE_VIOLATION) {
      return constraint === undefined || candidate.constraint_name === constraint;
    }
    current = candidate.cause;
  }
  return false;
}
