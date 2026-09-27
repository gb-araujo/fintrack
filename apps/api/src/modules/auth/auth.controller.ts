import { API_ERROR_CODES, AUTH_CLIENT_HEADER, NATIVE_CLIENTS } from '@fintrack/shared';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { AppConfig } from '../../config/env.js';
import { AppError, ForbiddenError, UnauthorizedError } from '../../shared/errors/index.js';
import {
  authResponseSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  toAuthResponse,
} from './auth.schema.js';
import type { AuthService } from './auth.service.js';
import type { IssuedSession, SessionContext } from './auth.types.js';

export interface AuthRoutesOptions {
  authService: AuthService;
  config: AppConfig;
}

export const REFRESH_COOKIE = 'fintrack_refresh';
const COOKIE_PATH = '/api/v1/auth';

function isNativeClient(request: FastifyRequest): boolean {
  const client = request.headers[AUTH_CLIENT_HEADER];
  return typeof client === 'string' && (NATIVE_CLIENTS as readonly string[]).includes(client);
}

function sessionContext(request: FastifyRequest): SessionContext {
  return { userAgent: request.headers['user-agent'] ?? null };
}

/**
 * Rotas de autenticação (ADR 0007).
 * Web: refresh token em cookie httpOnly + Secure + SameSite=Lax, restrito a /api/v1/auth.
 * Android (`X-Client: android`): refresh token no corpo da resposta/requisição.
 */
export const authRoutes: FastifyPluginCallbackZod<AuthRoutesOptions> = (
  app,
  { authService, config },
  done,
) => {
  // Limitador independente (createRateLimit): o `rateLimit` por rota marca a requisição como já
  // avaliada, então um segundo `app.rateLimit()` na mesma rota seria ignorado silenciosamente.
  const checkLoginAttempts = app.createRateLimit({
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const body = request.body as { email?: unknown } | undefined;
      return `login:${request.ip}:${typeof body?.email === 'string' ? body.email : ''}`;
    },
  });

  const cookieOptions: CookieSerializeOptions = {
    httpOnly: true,
    secure: config.AUTH_COOKIE_SECURE,
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
  };

  function sendSession(
    request: FastifyRequest,
    reply: FastifyReply,
    session: IssuedSession,
    statusCode: 200 | 201,
  ) {
    const native = isNativeClient(request);
    if (!native) void reply.setCookie(REFRESH_COOKIE, session.refreshToken, cookieOptions);
    void reply.header('cache-control', 'no-store');
    return reply.status(statusCode).send(toAuthResponse(session, native));
  }

  /**
   * Cookies são enviados automaticamente pelo navegador; por isso, quando o token vem do cookie,
   * a origem da requisição precisa ser a web autorizada (defesa em profundidade contra CSRF).
   */
  function refreshTokenFrom(request: FastifyRequest, bodyToken: string | undefined) {
    if (bodyToken) return bodyToken;
    const cookieToken = request.cookies[REFRESH_COOKIE];
    if (!cookieToken) return undefined;
    const origin = request.headers.origin;
    if (!origin || !config.CORS_ORIGINS.includes(origin)) {
      throw new ForbiddenError('Origem da requisição não permitida.');
    }
    return cookieToken;
  }

  app.post(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Cria a conta e inicia a sessão',
        body: registerRequestSchema,
        response: { 201: authResponseSchema },
      },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const session = await authService.register(request.body, sessionContext(request));
      return sendSession(request, reply, session, 201);
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Login com e-mail e senha',
        body: loginRequestSchema,
        response: { 200: authResponseSchema },
      },
      // Limite por IP (antes de ler o corpo) + limite por IP+e-mail (após validação).
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      preHandler: async (request, reply) => {
        const attempt = await checkLoginAttempts(request);
        // isAllowed=false só significa "fora da allow-list"; o estouro é indicado por isExceeded.
        if (!attempt.isAllowed && attempt.isExceeded) {
          void reply.header('retry-after', attempt.ttlInSeconds);
          throw new AppError(
            429,
            API_ERROR_CODES.RATE_LIMITED,
            'Muitas tentativas de login. Tente novamente em instantes.',
            { retryAfterSeconds: attempt.ttlInSeconds },
          );
        }
      },
    },
    async (request, reply) => {
      const session = await authService.login(request.body, sessionContext(request));
      return sendSession(request, reply, session, 200);
    },
  );

  app.post(
    '/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Renova a sessão (rotação do refresh token)',
        // Web envia corpo vazio (token no cookie); Android envia { refreshToken }.
        body: refreshRequestSchema.nullish(),
        response: { 200: authResponseSchema },
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = refreshTokenFrom(request, request.body?.refreshToken);
      if (!token) throw new UnauthorizedError('Sessão não encontrada. Faça login.');
      // Em caso de falha o cookie NÃO é apagado: numa corrida entre abas, a aba que perde
      // apagaria o cookie novo recém-emitido para a outra.
      const session = await authService.refresh(token, sessionContext(request));
      return sendSession(request, reply, session, 200);
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Encerra a sessão atual',
        // Web envia corpo vazio (token no cookie); Android envia { refreshToken }.
        body: refreshRequestSchema.nullish(),
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const token = refreshTokenFrom(request, request.body?.refreshToken);
      await authService.logout(token);
      void reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      return reply.status(204).send();
    },
  );
  done();
};
