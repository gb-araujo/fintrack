import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, UnauthorizedError } from '../../shared/errors/index.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { CreateUserInput, UserRecord, UserWithPassword } from '../users/users.types.js';
import { AuthService, type SecurityEvent } from './auth.service.js';
import type { NewRefreshToken, RefreshTokenRecord } from './auth.types.js';
import { ROTATION_GRACE_MS } from './domain/refresh-token-policy.js';
import { hashRefreshToken } from './domain/tokens.js';
import type { RefreshTokensRepository } from './refresh-tokens.repository.js';

class InMemoryUsers implements UsersRepository {
  rows: UserWithPassword[] = [];

  findById(id: string): Promise<UserRecord | undefined> {
    const row = this.rows.find((user) => user.id === id);
    if (!row) return Promise.resolve(undefined);
    const { passwordHash: _passwordHash, ...user } = row;
    return Promise.resolve(user);
  }

  findByEmailWithPassword(email: string) {
    return Promise.resolve(this.rows.find((user) => user.email === email.toLowerCase()));
  }

  create(input: CreateUserInput): Promise<UserRecord> {
    if (this.rows.some((user) => user.email === input.email.toLowerCase())) {
      return Promise.reject(new ConflictError('Este e-mail já está cadastrado.'));
    }
    const row: UserWithPassword = {
      id: randomUUID(),
      email: input.email.toLowerCase(),
      name: input.name,
      passwordHash: input.passwordHash,
      timezone: input.timezone ?? 'America/Sao_Paulo',
      currency: 'BRL',
      createdAt: new Date(),
    };
    this.rows.push(row);
    const { passwordHash: _passwordHash, ...user } = row;
    return Promise.resolve(user);
  }
}

class InMemoryRefreshTokens implements RefreshTokensRepository {
  rows: (RefreshTokenRecord & { tokenHash: string })[] = [];

  create(token: NewRefreshToken): Promise<RefreshTokenRecord> {
    const row = { ...token, id: randomUUID(), revokedAt: null, replacedById: null };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  findByHash(tokenHash: string) {
    return Promise.resolve(this.rows.find((row) => row.tokenHash === tokenHash));
  }

  async rotate(currentId: string, next: NewRefreshToken, now: Date) {
    const current = this.rows.find((row) => row.id === currentId);
    if (!current || current.revokedAt) return undefined;
    current.revokedAt = now;
    const created = await this.create(next);
    current.replacedById = created.id;
    return created;
  }

  revokeFamily(familyId: string, now: Date): Promise<void> {
    for (const row of this.rows) {
      if (row.familyId === familyId && !row.revokedAt) row.revokedAt = now;
    }
    return Promise.resolve();
  }

  active(familyId: string) {
    return this.rows.filter((row) => row.familyId === familyId && !row.revokedAt);
  }
}

describe('AuthService', () => {
  let users: InMemoryUsers;
  let tokens: InMemoryRefreshTokens;
  let events: SecurityEvent[];
  let now: Date;
  let service: AuthService;

  const context = { userAgent: 'vitest' };
  const registration = { name: 'Gabriel', email: 'g@exemplo.com', password: 'senha-segura-123' };

  beforeEach(() => {
    users = new InMemoryUsers();
    tokens = new InMemoryRefreshTokens();
    events = [];
    now = new Date('2026-09-26T12:00:00Z');
    service = new AuthService(
      users,
      tokens,
      {
        sign: (userId) => ({
          token: `access-${userId}`,
          expiresAt: new Date(now.getTime() + 900_000),
        }),
      },
      { refreshTokenTtlDays: 30, now: () => now, onSecurityEvent: (event) => events.push(event) },
    );
  });

  describe('register', () => {
    it('cria o usuário com senha em hash argon2id e inicia uma sessão', async () => {
      const session = await service.register(registration, context);

      expect(session.user.email).toBe('g@exemplo.com');
      expect(session.accessToken).toBe(`access-${session.user.id}`);
      expect(users.rows[0]!.passwordHash).toMatch(/^\$argon2id\$/);
      expect(users.rows[0]!.passwordHash).not.toContain(registration.password);
      expect(session.refreshTokenExpiresAt).toEqual(new Date('2026-10-26T12:00:00Z'));
    });

    it('guarda apenas o hash do refresh token', async () => {
      const session = await service.register(registration, context);

      expect(tokens.rows).toHaveLength(1);
      expect(tokens.rows[0]!.tokenHash).toBe(hashRefreshToken(session.refreshToken));
      expect(JSON.stringify(tokens.rows)).not.toContain(session.refreshToken);
    });

    it('não permite e-mail duplicado', async () => {
      await service.register(registration, context);
      await expect(service.register(registration, context)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await service.register(registration, context);
    });

    it('autentica com a senha correta', async () => {
      const session = await service.login(
        { email: registration.email, password: registration.password },
        context,
      );
      expect(session.user.email).toBe(registration.email);
      expect(session).not.toHaveProperty('user.passwordHash');
    });

    it('senha errada e e-mail inexistente produzem o MESMO erro', async () => {
      const wrongPassword = await service
        .login({ email: registration.email, password: 'errada' }, context)
        .catch((error: unknown) => error);
      const unknownEmail = await service
        .login({ email: 'ninguem@exemplo.com', password: 'qualquer' }, context)
        .catch((error: unknown) => error);

      expect(wrongPassword).toBeInstanceOf(UnauthorizedError);
      expect(unknownEmail).toBeInstanceOf(UnauthorizedError);
      expect((wrongPassword as Error).message).toBe((unknownEmail as Error).message);
      expect(events.filter((event) => event.type === 'login_failed')).toHaveLength(2);
    });

    it('cada login inicia uma família de sessão independente', async () => {
      const first = await service.login(registration, context);
      const second = await service.login(registration, context);
      const familyOf = (token: string) =>
        tokens.rows.find((row) => row.tokenHash === hashRefreshToken(token))!.familyId;
      expect(familyOf(first.refreshToken)).not.toBe(familyOf(second.refreshToken));
    });
  });

  describe('refresh', () => {
    it('rotaciona: emite novo token na mesma família e invalida o anterior', async () => {
      const session = await service.register(registration, context);
      const refreshed = await service.refresh(session.refreshToken, context);

      expect(refreshed.refreshToken).not.toBe(session.refreshToken);
      const old = tokens.rows.find(
        (row) => row.tokenHash === hashRefreshToken(session.refreshToken),
      )!;
      const current = tokens.rows.find(
        (row) => row.tokenHash === hashRefreshToken(refreshed.refreshToken),
      )!;
      expect(old.revokedAt).toEqual(now);
      expect(old.replacedById).toBe(current.id);
      expect(current.familyId).toBe(old.familyId);
    });

    it('token desconhecido → 401', async () => {
      await expect(service.refresh('nao-existe', context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('token expirado → 401', async () => {
      const session = await service.register(registration, context);
      now = new Date('2026-10-27T00:00:00Z');
      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });

    it('reapresentar token rotacionado DENTRO da janela (abas concorrentes) não derruba a sessão', async () => {
      const session = await service.register(registration, context);
      const refreshed = await service.refresh(session.refreshToken, context);

      now = new Date(now.getTime() + ROTATION_GRACE_MS - 1);
      await expect(service.refresh(session.refreshToken, context)).rejects.toMatchObject({
        statusCode: 401,
        details: { reason: 'concurrent_rotation' },
      });

      // A sessão legítima continua válida.
      await expect(service.refresh(refreshed.refreshToken, context)).resolves.toBeDefined();
      expect(events.some((event) => event.type === 'refresh_token_reuse')).toBe(false);
    });

    it('reapresentar token rotacionado APÓS a janela = reuso: revoga a família inteira', async () => {
      const session = await service.register(registration, context);
      const refreshed = await service.refresh(session.refreshToken, context);
      const familyId = tokens.rows[0]!.familyId;

      now = new Date(now.getTime() + ROTATION_GRACE_MS + 1);
      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );

      expect(tokens.active(familyId)).toHaveLength(0);
      await expect(service.refresh(refreshed.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
      expect(events).toContainEqual({
        type: 'refresh_token_reuse',
        userId: session.user.id,
        familyId,
      });
    });

    it('reuso numa família não afeta outras sessões do mesmo usuário', async () => {
      const phone = await service.register(registration, context);
      const laptop = await service.login(registration, context);
      await service.refresh(phone.refreshToken, context);

      now = new Date(now.getTime() + ROTATION_GRACE_MS + 1);
      await service.refresh(phone.refreshToken, context).catch(() => undefined);

      await expect(service.refresh(laptop.refreshToken, context)).resolves.toBeDefined();
    });
  });

  describe('logout', () => {
    it('revoga a família da sessão e é idempotente', async () => {
      const session = await service.register(registration, context);
      await service.logout(session.refreshToken);
      await service.logout(session.refreshToken);
      await service.logout(undefined);

      await expect(service.refresh(session.refreshToken, context)).rejects.toBeInstanceOf(
        UnauthorizedError,
      );
    });
  });
});
