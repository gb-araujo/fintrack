import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { z } from 'zod';
import type { AppConfig } from '../config/env.js';
import type { AccessTokenSigner } from '../modules/auth/auth.types.js';
import { addMinutes } from '../modules/auth/domain/tokens.js';
import { UnauthorizedError } from '../shared/errors/index.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    /** Hook de autenticação: valida o Bearer token e preenche `request.userId`. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    accessTokenSigner: AccessTokenSigner;
  }
  interface FastifyRequest {
    /** Id do usuário autenticado — a ÚNICA fonte de userId da API. */
    userId: string;
  }
}

export interface AuthPluginOptions {
  config: AppConfig;
}

const ISSUER = 'fintrack-api';
const AUDIENCE = 'fintrack';
const userIdSchema = z.uuid();

export const authPlugin = fp<AuthPluginOptions>(
  async (app, { config }) => {
    await app.register(cookie);

    await app.register(jwt, {
      secret: config.JWT_SECRET,
      sign: {
        algorithm: 'HS256',
        expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m`,
        iss: ISSUER,
        aud: AUDIENCE,
      },
      verify: {
        algorithms: ['HS256'],
        allowedIss: ISSUER,
        allowedAud: AUDIENCE,
      },
    });

    app.decorateRequest('userId', '');

    app.decorate('authenticate', async (request: FastifyRequest) => {
      try {
        await request.jwtVerify();
      } catch {
        throw new UnauthorizedError('Token de acesso inválido ou expirado.');
      }
      const userId = userIdSchema.safeParse(request.user.sub);
      if (!userId.success) throw new UnauthorizedError('Token de acesso inválido.');
      request.userId = userId.data;
    });

    app.decorate<AccessTokenSigner>('accessTokenSigner', {
      sign(userId: string) {
        const now = new Date();
        return {
          token: app.jwt.sign({ sub: userId }),
          expiresAt: addMinutes(now, config.ACCESS_TOKEN_TTL_MINUTES),
        };
      },
    });
  },
  { name: 'auth', dependencies: ['error-handler'] },
);
