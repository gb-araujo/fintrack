import {
  todayInTimeZone,
  type CompleteRequest,
  type CreateTransferRequest,
  type UpdateTransferRequest,
} from '@fintrack/shared';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import {
  assertCompletedDateNotFuture,
  resolveCompletionDate,
  resolveInitialStatus,
} from '../transactions/domain/transaction-rules.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { TransfersRepository } from './transfers.repository.js';
import type { TransferRecord, TransferValues } from './transfers.types.js';

export interface TransfersServiceDeps {
  transfers: TransfersRepository;
  accounts: AccountsRepository;
  users: UsersRepository;
  now?: () => Date;
}

/**
 * Transferência entre contas do usuário. Não é receita nem despesa: move dinheiro de uma conta
 * para outra sem alterar o patrimônio (docs/financial-rules.md §3). Aplicações e resgates de
 * investimento são transferências de/para contas do tipo `investment` (ADR 0006).
 */
export class TransfersService {
  private readonly now: () => Date;

  constructor(private readonly deps: TransfersServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  async get(userId: string, id: string): Promise<TransferRecord> {
    return this.require(await this.deps.transfers.findById(userId, id));
  }

  async create(userId: string, input: CreateTransferRequest): Promise<TransferRecord> {
    if (input.fromAccountId === input.toAccountId) {
      throw new BusinessRuleError('A conta de origem e a de destino devem ser diferentes.');
    }
    const status = resolveInitialStatus(input.status, input.transferDate, await this.today(userId));
    await this.assertUsable(userId, input.fromAccountId, 'Conta de origem não encontrada.');
    await this.assertUsable(userId, input.toAccountId, 'Conta de destino não encontrada.');

    return this.deps.transfers.create(userId, {
      fromAccountId: input.fromAccountId,
      toAccountId: input.toAccountId,
      amountCents: input.amountCents,
      transferDate: input.transferDate,
      description: input.description ?? '',
      status,
    });
  }

  async update(userId: string, id: string, input: UpdateTransferRequest): Promise<TransferRecord> {
    const current = await this.get(userId, id);
    if (current.status === 'cancelled') {
      throw new ConflictError('Transferência cancelada não pode ser alterada.');
    }

    const next: TransferValues = {
      fromAccountId: input.fromAccountId ?? current.fromAccountId,
      toAccountId: input.toAccountId ?? current.toAccountId,
      amountCents: input.amountCents ?? current.amountCents,
      transferDate: input.transferDate ?? current.transferDate,
      description: input.description ?? current.description,
      status: current.status,
    };
    if (next.fromAccountId === next.toAccountId) {
      throw new BusinessRuleError('A conta de origem e a de destino devem ser diferentes.');
    }
    assertCompletedDateNotFuture(current.status, next.transferDate, await this.today(userId));

    // Só valida as contas que o usuário está trocando agora (uma conta já arquivada não impede
    // corrigir o valor de uma transferência antiga).
    if (next.fromAccountId !== current.fromAccountId) {
      await this.assertUsable(userId, next.fromAccountId, 'Conta de origem não encontrada.');
    }
    if (next.toAccountId !== current.toAccountId) {
      await this.assertUsable(userId, next.toAccountId, 'Conta de destino não encontrada.');
    }
    return this.require(await this.deps.transfers.replace(userId, id, next));
  }

  /** Pendente → efetivada (as duas pernas juntas). Idempotente se já estiver efetivada. */
  async complete(userId: string, id: string, input: CompleteRequest = {}): Promise<TransferRecord> {
    const current = await this.get(userId, id);
    if (current.status === 'cancelled') {
      throw new ConflictError('Transferência cancelada não pode ser efetivada.');
    }
    if (current.status === 'completed') return current;

    const date = resolveCompletionDate(
      current.transferDate,
      input.transactionDate,
      await this.today(userId),
    );
    return this.require(
      await this.deps.transfers.replace(userId, id, {
        ...current,
        transferDate: date,
        status: 'completed',
      }),
    );
  }

  /** Cancela as duas pernas (nunca apaga). Idempotente. */
  async cancel(userId: string, id: string): Promise<TransferRecord> {
    const current = await this.get(userId, id);
    if (current.status === 'cancelled') return current;
    return this.require(
      await this.deps.transfers.replace(userId, id, { ...current, status: 'cancelled' }),
    );
  }

  private async assertUsable(userId: string, accountId: string, notFoundMessage: string) {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (!account) throw new NotFoundError(notFoundMessage);
    if (account.archivedAt) {
      throw new ConflictError(
        `A conta "${account.name}" está arquivada. Reative-a para transferir.`,
      );
    }
  }

  private require(record: TransferRecord | undefined): TransferRecord {
    if (!record) throw new NotFoundError('Transferência não encontrada.');
    return record;
  }
}
