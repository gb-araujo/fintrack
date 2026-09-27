import type { AccountType } from '@fintrack/shared';

export interface AccountRecord {
  id: string;
  name: string;
  type: AccountType;
  initialBalanceCents: number;
  /** Calculado no banco: saldo inicial + lançamentos efetivados. Nunca persistido. */
  balanceCents: number;
  includeInAvailable: boolean;
  archivedAt: Date | null;
  createdAt: Date;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  initialBalanceCents: number;
  includeInAvailable: boolean;
}

export interface UpdateAccountInput {
  name?: string;
  initialBalanceCents?: number;
  includeInAvailable?: boolean;
}
