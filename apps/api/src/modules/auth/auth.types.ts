import type { UserRecord } from '../users/users.types.js';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
}

export interface NewRefreshToken {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
}

/** Metadados da requisição relevantes para a sessão (nunca dados financeiros). */
export interface SessionContext {
  userAgent: string | null;
}

export interface IssuedSession {
  user: UserRecord;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** Assinatura de access tokens — implementada com @fastify/jwt; injetada para testes. */
export interface AccessTokenSigner {
  sign(userId: string): { token: string; expiresAt: Date };
}
