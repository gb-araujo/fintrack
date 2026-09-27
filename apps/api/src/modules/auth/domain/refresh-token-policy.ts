/**
 * Política de validação de refresh tokens (ADR 0007).
 *
 * - valid:    pode ser rotacionado.
 * - expired:  expirado; o cliente precisa fazer login.
 * - race:     acabou de ser rotacionado por outra requisição concorrente (ex.: duas abas).
 *             Não é roubo: responde 401 sem revogar a sessão; o cliente tenta de novo com o
 *             token atual (na web, o cookie já foi atualizado pela outra aba).
 * - reused:   token antigo reapresentado depois da janela de tolerância → possível roubo.
 *             A família inteira (todas as sessões derivadas) é revogada.
 * - revoked:  revogado por logout ou por detecção de reuso.
 */
export type RefreshTokenVerdict = 'valid' | 'expired' | 'race' | 'reused' | 'revoked';

export interface RefreshTokenState {
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

/** Janela em que reapresentar um token recém-rotacionado é tratado como concorrência legítima. */
export const ROTATION_GRACE_MS = 30_000;

export function evaluateRefreshToken(
  token: RefreshTokenState,
  now: Date,
  graceMs: number = ROTATION_GRACE_MS,
): RefreshTokenVerdict {
  if (token.revokedAt) {
    if (!token.replacedById) return 'revoked';
    const sinceRotation = now.getTime() - token.revokedAt.getTime();
    return sinceRotation <= graceMs ? 'race' : 'reused';
  }
  if (token.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'valid';
}
