import { hash, verify } from '@node-rs/argon2';

/**
 * Hash de senha com argon2id (padrão da biblioteca: m=19 MiB, t=2, p=1 — recomendação OWASP).
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHashPromise: Promise<string> | undefined;

/**
 * Quando o e-mail não existe, ainda assim executa uma verificação argon2 completa contra um hash
 * descartável. Assim o tempo de resposta não revela se o e-mail está cadastrado.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHashPromise ??= hash('fintrack-dummy-password-for-timing');
  await verifyPassword(await dummyHashPromise, password);
}
