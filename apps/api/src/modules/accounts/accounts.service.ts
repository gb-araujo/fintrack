import type { AccountType, CreateAccountRequest, UpdateAccountRequest } from '@fintrack/shared';
import { NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from './accounts.repository.js';
import type { AccountRecord } from './accounts.types.js';

/** Contas de investimento não entram no "dinheiro disponível" por padrão (FASE 3). */
export function defaultIncludeInAvailable(type: AccountType): boolean {
  return type !== 'investment';
}

export class AccountsService {
  constructor(private readonly accounts: AccountsRepository) {}

  async list(userId: string, includeArchived: boolean): Promise<AccountRecord[]> {
    return this.accounts.list(userId, { includeArchived });
  }

  async get(userId: string, id: string): Promise<AccountRecord> {
    return this.require(await this.accounts.findById(userId, id));
  }

  async create(userId: string, input: CreateAccountRequest): Promise<AccountRecord> {
    return this.accounts.create(userId, {
      name: input.name,
      type: input.type,
      initialBalanceCents: input.initialBalanceCents ?? 0,
      includeInAvailable: input.includeInAvailable ?? defaultIncludeInAvailable(input.type),
    });
  }

  async update(userId: string, id: string, input: UpdateAccountRequest): Promise<AccountRecord> {
    return this.require(
      await this.accounts.update(userId, id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.initialBalanceCents !== undefined
          ? { initialBalanceCents: input.initialBalanceCents }
          : {}),
        ...(input.includeInAvailable !== undefined
          ? { includeInAvailable: input.includeInAvailable }
          : {}),
      }),
    );
  }

  /** Contas nunca são apagadas: o histórico de lançamentos permanece. Idempotente. */
  async archive(userId: string, id: string): Promise<AccountRecord> {
    const current = await this.get(userId, id);
    if (current.archivedAt) return current;
    return this.require(await this.accounts.setArchived(userId, id, true));
  }

  async unarchive(userId: string, id: string): Promise<AccountRecord> {
    const current = await this.get(userId, id);
    if (!current.archivedAt) return current;
    return this.require(await this.accounts.setArchived(userId, id, false));
  }

  private require(account: AccountRecord | undefined): AccountRecord {
    // Conta inexistente OU de outro usuário: a mesma resposta (não revela a existência).
    if (!account) throw new NotFoundError('Conta não encontrada.');
    return account;
  }
}
