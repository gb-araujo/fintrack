import { authResponseSchema, userSchema } from '@fintrack/shared';
import { createSigner } from 'fast-jwt';
import { sql } from 'drizzle-orm';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { createDatabase } from '../../db/client.js';
import { TEST_JWT_SECRET, testConfig, uniqueEmail } from '../../test/helpers.js';
import { REFRESH_COOKIE } from './auth.controller.js';
import { ROTATION_GRACE_MS } from './domain/refresh-token-policy.js';
import { hashRefreshToken } from './domain/tokens.js';

/**
 * Fluxo completo de autenticação contra PostgreSQL real.
 * Roda apenas com TEST_DATABASE_URL (CI e `docker compose up -d db` local).
 */
const databaseUrl = process.env.TEST_DATABASE_URL;
const WEB_ORIGIN = 'http://localhost:5173';
const PASSWORD = 'senha-muito-segura';

describe.skipIf(!databaseUrl)('autenticação (integração)', () => {
  const database = createDatabase(databaseUrl ?? '', { maxConnections: 5 });
  let app: App;

  beforeAll(async () => {
    app = await buildApp({ config: testConfig({ DATABASE_URL: databaseUrl ?? '' }), database });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  const android = { 'x-client': 'android' };

  // Cada requisição com um IP distinto: os limites por IP não interferem entre testes.
  // Os testes de rate limit fixam o IP explicitamente.
  let requestCounter = 0;
  function send(options: InjectOptions) {
    requestCounter++;
    const ip = `10.${(requestCounter >> 16) & 255}.${(requestCounter >> 8) & 255}.${requestCounter & 255}`;
    return app.inject({ remoteAddress: ip, ...options });
  }

  async function registerAndroid(email = uniqueEmail()) {
    const response = await send({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: android,
      payload: { name: 'Pessoa Teste', email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    return { email, body: authResponseSchema.parse(response.json()) };
  }

  function refreshCookie(response: { cookies: { name: string; value: string }[] }) {
    return response.cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
  }

  describe('cadastro', () => {
    it('web: 201, access token no corpo e refresh SOMENTE em cookie httpOnly/SameSite=Lax', async () => {
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          name: 'Gabriel',
          email: uniqueEmail(),
          password: PASSWORD,
          timezone: 'America/Manaus',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = authResponseSchema.parse(response.json());
      expect(body.refreshToken).toBeUndefined();
      expect(body.user.timezone).toBe('America/Manaus');
      expect(body.user.currency).toBe('BRL');
      expect(response.headers['cache-control']).toBe('no-store');

      const cookie = refreshCookie(response);
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api/v1/auth' });
      expect(cookie?.value.length).toBeGreaterThan(40);
    });

    it('android: refresh token no corpo e nenhum cookie', async () => {
      const { body } = await registerAndroid();
      expect(body.refreshToken).toBeDefined();
      expect(body.refreshTokenExpiresAt).toBeDefined();
    });

    it('e-mail duplicado (ignorando maiúsculas) → 409', async () => {
      const { email } = await registerAndroid();
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'Outro', email: email.toUpperCase(), password: PASSWORD },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ error: { code: 'CONFLICT' } });
    });

    it('senha fraca → 400 com detalhes', async () => {
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'X', email: uniqueEmail(), password: '123' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    });

    it('rate limit por IP: o 6º cadastro no minuto → 429', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await send({
          method: 'POST',
          url: '/api/v1/auth/register',
          remoteAddress: '10.250.0.1',
          payload: { name: 'Spam', email: uniqueEmail('spam'), password: PASSWORD },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses).toEqual([201, 201, 201, 201, 201, 429]);
    });

    it('a senha nunca é armazenada em texto puro', async () => {
      const { email } = await registerAndroid();
      const rows = await database.db.execute<{ password_hash: string }>(
        sql`select password_hash from users where email = ${email}`,
      );
      expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
    });
  });

  describe('login', () => {
    it('credenciais corretas (e-mail em maiúsculas) → 200', async () => {
      const { email } = await registerAndroid();
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: android,
        payload: { email: email.toUpperCase(), password: PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      expect(authResponseSchema.parse(response.json()).user.email).toBe(email);
    });

    it('senha errada e e-mail inexistente → mesmo 401 genérico', async () => {
      const { email } = await registerAndroid();
      const wrong = await send({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: 'senha-errada' },
      });
      const unknown = await send({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: uniqueEmail(), password: 'senha-errada' },
      });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
    });

    it('rate limit por IP + e-mail: a 6ª tentativa no minuto → 429', async () => {
      const email = uniqueEmail('bruteforce');
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const response = await send({
          method: 'POST',
          url: '/api/v1/auth/login',
          remoteAddress: '10.9.9.9',
          payload: { email, password: 'tentativa' },
        });
        statuses.push(response.statusCode);
      }
      expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
      expect(statuses[5]).toBe(429);
    });
  });

  describe('GET /users/me', () => {
    it('retorna o usuário do token', async () => {
      const { body } = await registerAndroid();
      const response = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${body.accessToken}` },
      });
      expect(response.statusCode).toBe(200);
      expect(userSchema.parse(response.json())).toEqual(body.user);
    });

    it('userId vem SOMENTE do token: parâmetros do cliente são ignorados', async () => {
      const alice = await registerAndroid();
      const bob = await registerAndroid();
      const response = await send({
        method: 'GET',
        url: `/api/v1/users/me?userId=${bob.body.user.id}`,
        headers: {
          authorization: `Bearer ${alice.body.accessToken}`,
          'x-user-id': bob.body.user.id,
        },
      });
      expect(response.json()).toMatchObject({ id: alice.body.user.id });
    });

    it.each([
      ['sem token', undefined],
      ['token malformado', 'Bearer abc.def.ghi'],
      ['esquema errado', 'Basic dXNlcjpwYXNz'],
    ])('%s → 401', async (_label, authorization) => {
      const response = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: authorization ? { authorization } : {},
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    });

    it('token assinado com outro segredo → 401', async () => {
      const { body } = await registerAndroid();
      const forged = createSigner({
        key: 'outro-segredo-com-32-caracteres-ou-mais!!',
        expiresIn: 60_000,
      })({
        sub: body.user.id,
        iss: 'fintrack-api',
        aud: 'fintrack',
      });
      const response = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${forged}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it('token expirado → 401', async () => {
      const { body } = await registerAndroid();
      const expired = createSigner({ key: TEST_JWT_SECRET, expiresIn: 1 })({
        sub: body.user.id,
        iss: 'fintrack-api',
        aud: 'fintrack',
        iat: Math.floor(Date.now() / 1000) - 3600,
      });
      const response = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${expired}` },
      });
      expect(response.statusCode).toBe(401);
    });

    it('token com algoritmo "none" → 401', async () => {
      const { body } = await registerAndroid();
      const unsigned = createSigner({ algorithm: 'none' })({
        sub: body.user.id,
        iss: 'fintrack-api',
        aud: 'fintrack',
      });
      const response = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${unsigned}` },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('refresh (android)', () => {
    it('rotaciona o token e o novo access token funciona', async () => {
      const { body } = await registerAndroid();
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: body.refreshToken },
      });
      expect(response.statusCode).toBe(200);
      const refreshed = authResponseSchema.parse(response.json());
      expect(refreshed.refreshToken).not.toBe(body.refreshToken);

      const me = await send({
        method: 'GET',
        url: '/api/v1/users/me',
        headers: { authorization: `Bearer ${refreshed.accessToken}` },
      });
      expect(me.statusCode).toBe(200);
    });

    it('reapresentar o token logo após a rotação (concorrência) → 401 com reason, sessão preservada', async () => {
      const { body } = await registerAndroid();
      const first = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: body.refreshToken },
      });
      const current = authResponseSchema.parse(first.json()).refreshToken!;

      const concurrent = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: body.refreshToken },
      });
      expect(concurrent.statusCode).toBe(401);
      expect(concurrent.json()).toMatchObject({
        error: { code: 'UNAUTHORIZED', details: { reason: 'concurrent_rotation' } },
      });

      const legit = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: current },
      });
      expect(legit.statusCode).toBe(200);
    });

    it('reuso de token antigo após a janela revoga toda a sessão', async () => {
      const { body } = await registerAndroid();
      const first = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: body.refreshToken },
      });
      const current = authResponseSchema.parse(first.json()).refreshToken!;

      // Simula o passar do tempo além da janela de tolerância.
      await database.db.execute(
        sql`update refresh_tokens
            set revoked_at = revoked_at - make_interval(secs => ${(ROTATION_GRACE_MS + 5_000) / 1000})
            where token_hash = ${hashRefreshToken(body.refreshToken!)}`,
      );

      const reuse = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: body.refreshToken },
      });
      expect(reuse.statusCode).toBe(401);

      const legit = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: { refreshToken: current },
      });
      expect(legit.statusCode).toBe(401);
    });

    it('sem token → 401', async () => {
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: android,
        payload: {},
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('refresh e logout (web, cookie)', () => {
    async function registerWeb() {
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { name: 'Web', email: uniqueEmail(), password: PASSWORD },
      });
      return refreshCookie(response)!.value;
    }

    it('origem autorizada → 200 e novo cookie', async () => {
      const token = await registerWeb();
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { origin: WEB_ORIGIN },
        cookies: { [REFRESH_COOKIE]: token },
      });
      expect(response.statusCode).toBe(200);
      expect(authResponseSchema.parse(response.json()).refreshToken).toBeUndefined();
      const renewed = refreshCookie(response);
      expect(renewed?.value).toBeDefined();
      expect(renewed?.value).not.toBe(token);
    });

    it.each([
      ['origem de outro site', { origin: 'https://site-malicioso.example' }],
      ['sem cabeçalho Origin', {}],
    ])('%s → 403 (proteção CSRF)', async (_label, headers) => {
      const token = await registerWeb();
      const response = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers,
        cookies: { [REFRESH_COOKIE]: token },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    });

    it('logout revoga a sessão, apaga o cookie e é idempotente', async () => {
      const token = await registerWeb();
      const logout = await send({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: WEB_ORIGIN },
        cookies: { [REFRESH_COOKIE]: token },
      });
      expect(logout.statusCode).toBe(204);
      expect(refreshCookie(logout)?.value).toBe('');

      const again = await send({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin: WEB_ORIGIN },
      });
      expect(again.statusCode).toBe(204);

      const refresh = await send({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: { origin: WEB_ORIGIN },
        cookies: { [REFRESH_COOKIE]: token },
      });
      expect(refresh.statusCode).toBe(401);
    });
  });
});
