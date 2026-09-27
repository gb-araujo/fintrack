import type { User } from '@fintrack/shared';
import type { UserRecord } from './users.types.js';

export { userSchema } from '@fintrack/shared';

/** Converte o registro interno no contrato público (nunca expõe o hash da senha). */
export function toUserResponse(user: UserRecord): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    currency: user.currency,
    createdAt: user.createdAt.toISOString(),
  };
}
