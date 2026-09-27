import type { Account } from '@fintrack/shared';
import type { AccountRecord } from './accounts.types.js';

export {
  accountListResponseSchema,
  accountSchema,
  createAccountRequestSchema,
  listAccountsQuerySchema,
  updateAccountRequestSchema,
} from '@fintrack/shared';

export function toAccountResponse(account: AccountRecord): Account {
  return {
    id: account.id,
    name: account.name,
    type: account.type,
    initialBalanceCents: account.initialBalanceCents,
    balanceCents: account.balanceCents,
    includeInAvailable: account.includeInAvailable,
    archivedAt: account.archivedAt?.toISOString() ?? null,
    createdAt: account.createdAt.toISOString(),
  };
}
