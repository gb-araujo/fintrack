import type { AuthResponse } from '@fintrack/shared';
import { toUserResponse } from '../users/users.schema.js';
import type { IssuedSession } from './auth.types.js';

export {
  authResponseSchema,
  loginRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
} from '@fintrack/shared';

/**
 * Converte a sessão no contrato público. O refresh token só vai no corpo para clientes nativos;
 * na web ele trafega exclusivamente no cookie httpOnly (inacessível a JavaScript).
 */
export function toAuthResponse(session: IssuedSession, includeRefreshToken: boolean): AuthResponse {
  return {
    user: toUserResponse(session.user),
    accessToken: session.accessToken,
    accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    ...(includeRefreshToken
      ? {
          refreshToken: session.refreshToken,
          refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
        }
      : {}),
  };
}
