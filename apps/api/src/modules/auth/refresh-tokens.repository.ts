import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { refreshTokens } from '../../db/schema/index.js';
import type { NewRefreshToken, RefreshTokenRecord } from './auth.types.js';

export interface RefreshTokensRepository {
  create(token: NewRefreshToken): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined>;
  /**
   * Rotação atômica: revoga `currentId` SOMENTE se ainda estiver ativo e cria o substituto.
   * Retorna undefined se outra requisição rotacionou o token antes (concorrência).
   */
  rotate(
    currentId: string,
    next: NewRefreshToken,
    now: Date,
  ): Promise<RefreshTokenRecord | undefined>;
  /** Revoga todos os tokens ativos da família (logout ou reuso detectado). */
  revokeFamily(familyId: string, now: Date): Promise<void>;
}

const recordColumns = {
  id: refreshTokens.id,
  userId: refreshTokens.userId,
  familyId: refreshTokens.familyId,
  expiresAt: refreshTokens.expiresAt,
  revokedAt: refreshTokens.revokedAt,
  replacedById: refreshTokens.replacedById,
};

export class DrizzleRefreshTokensRepository implements RefreshTokensRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const [row] = await this.db.insert(refreshTokens).values(token).returning(recordColumns);
    if (!row) throw new Error('INSERT em refresh_tokens não retornou linha');
    return row;
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    const [row] = await this.db
      .select(recordColumns)
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return row;
  }

  async rotate(
    currentId: string,
    next: NewRefreshToken,
    now: Date,
  ): Promise<RefreshTokenRecord | undefined> {
    return this.db.transaction(async (tx) => {
      // Trava a linha: duas rotações simultâneas do mesmo token não podem ambas vencer.
      const [current] = await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.id, currentId), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (!current) return undefined;

      const [created] = await tx.insert(refreshTokens).values(next).returning(recordColumns);
      if (!created) throw new Error('INSERT em refresh_tokens não retornou linha');

      await tx
        .update(refreshTokens)
        .set({ replacedById: created.id })
        .where(eq(refreshTokens.id, currentId));
      return created;
    });
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
}
