import { randomUUID } from 'node:crypto';
import {
  API_ERROR_CODES,
  REFRESH_RACE_REASON,
  type LoginRequest,
  type RegisterRequest,
} from '@fintrack/shared';
import { AppError, UnauthorizedError } from '../../shared/errors/index.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { UserRecord } from '../users/users.types.js';
import type {
  AccessTokenSigner,
  IssuedSession,
  RefreshTokenRecord,
  SessionContext,
} from './auth.types.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './domain/password.js';
import { evaluateRefreshToken, type RefreshTokenVerdict } from './domain/refresh-token-policy.js';
import { addDays, generateRefreshToken, hashRefreshToken } from './domain/tokens.js';
import type { RefreshTokensRepository } from './refresh-tokens.repository.js';

export interface AuthServiceOptions {
  refreshTokenTtlDays: number;
  now?: () => Date;
  /** Registro de eventos de segurança (sem tokens, senhas ou dados financeiros). */
  onSecurityEvent?: (event: SecurityEvent) => void;
}

export type SecurityEvent =
  { type: 'refresh_token_reuse'; userId: string; familyId: string } | { type: 'login_failed' };

const INVALID_CREDENTIALS = 'E-mail ou senha inválidos.';
const INVALID_SESSION = 'Sessão inválida ou expirada. Faça login novamente.';

/** 401 específico de corrida entre requisições: o cliente pode tentar de novo com o token atual. */
function concurrentRotationError(): AppError {
  return new AppError(401, API_ERROR_CODES.UNAUTHORIZED, INVALID_SESSION, {
    reason: REFRESH_RACE_REASON,
  });
}

export class AuthService {
  private readonly now: () => Date;

  constructor(
    private readonly users: UsersRepository,
    private readonly refreshTokens: RefreshTokensRepository,
    private readonly signer: AccessTokenSigner,
    private readonly options: AuthServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  async register(input: RegisterRequest, context: SessionContext): Promise<IssuedSession> {
    const passwordHash = await hashPassword(input.password);
    // Unicidade do e-mail garantida pelo banco (citext UNIQUE) → ConflictError no repositório.
    const user = await this.users.create({
      email: input.email,
      name: input.name,
      passwordHash,
      ...(input.timezone ? { timezone: input.timezone } : {}),
    });
    return this.startSession(user, context);
  }

  async login(input: LoginRequest, context: SessionContext): Promise<IssuedSession> {
    const user = await this.users.findByEmailWithPassword(input.email);
    if (!user) {
      await verifyAgainstDummy(input.password);
      this.options.onSecurityEvent?.({ type: 'login_failed' });
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const valid = await verifyPassword(user.passwordHash, input.password);
    if (!valid) {
      this.options.onSecurityEvent?.({ type: 'login_failed' });
      throw new UnauthorizedError(INVALID_CREDENTIALS);
    }

    const { passwordHash: _passwordHash, ...publicUser } = user;
    return this.startSession(publicUser, context);
  }

  /** Troca um refresh token válido por uma nova sessão (rotação). */
  async refresh(refreshToken: string, context: SessionContext): Promise<IssuedSession> {
    const now = this.now();
    const record = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (!record) throw new UnauthorizedError(INVALID_SESSION);

    const verdict = evaluateRefreshToken(record, now);
    if (verdict === 'race') throw concurrentRotationError();
    if (verdict !== 'valid') {
      await this.handleInvalidToken(record, verdict, now);
      throw new UnauthorizedError(INVALID_SESSION);
    }

    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthorizedError(INVALID_SESSION);

    const next = this.newRefreshToken(user.id, record.familyId, context, now);
    const rotated = await this.refreshTokens.rotate(record.id, next.row, now);
    // Outra requisição rotacionou este token no mesmo instante: concorrência, não roubo.
    if (!rotated) throw concurrentRotationError();

    return this.buildSession(user, next.token, next.row.expiresAt);
  }

  /** Encerra a sessão (família) do refresh token. Idempotente. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const record = await this.refreshTokens.findByHash(hashRefreshToken(refreshToken));
    if (record) await this.refreshTokens.revokeFamily(record.familyId, this.now());
  }

  private async handleInvalidToken(
    record: RefreshTokenRecord,
    verdict: Exclude<RefreshTokenVerdict, 'valid' | 'race'>,
    now: Date,
  ): Promise<void> {
    if (verdict === 'reused') {
      await this.refreshTokens.revokeFamily(record.familyId, now);
      this.options.onSecurityEvent?.({
        type: 'refresh_token_reuse',
        userId: record.userId,
        familyId: record.familyId,
      });
    }
  }

  private async startSession(user: UserRecord, context: SessionContext): Promise<IssuedSession> {
    const now = this.now();
    const next = this.newRefreshToken(user.id, randomUUID(), context, now);
    await this.refreshTokens.create(next.row);
    return this.buildSession(user, next.token, next.row.expiresAt);
  }

  private newRefreshToken(userId: string, familyId: string, context: SessionContext, now: Date) {
    const token = generateRefreshToken();
    return {
      token,
      row: {
        userId,
        familyId,
        tokenHash: hashRefreshToken(token),
        expiresAt: addDays(now, this.options.refreshTokenTtlDays),
        userAgent: context.userAgent?.slice(0, 255) ?? null,
      },
    };
  }

  private buildSession(
    user: UserRecord,
    refreshToken: string,
    refreshTokenExpiresAt: Date,
  ): IssuedSession {
    const access = this.signer.sign(user.id);
    return {
      user,
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }
}
