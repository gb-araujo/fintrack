import {
  DEFAULT_PAGE_SIZE,
  todayInTimeZone,
  type CompleteRequest,
  type CreateTransactionRequest,
  type ListTransactionsQuery,
  type TransactionType,
  type UpdateTransactionRequest,
} from '@fintrack/shared';
import { ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import {
  assertAccountAcceptsEntry,
  assertCategoryFits,
  assertCompletedDateNotFuture,
  assertEditable,
  resolveCompletionDate,
  resolveInitialStatus,
} from './domain/transaction-rules.js';
import type { TransactionsRepository } from './transactions.repository.js';
import type { TransactionPatch, TransactionRecord } from './transactions.types.js';

const TRANSFER_LEG_MESSAGE =
  'Este lançamento faz parte de uma transferência. Altere ou cancele a transferência.';

export interface TransactionsServiceDeps {
  transactions: TransactionsRepository;
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  users: UsersRepository;
  now?: () => Date;
}

export class TransactionsService {
  private readonly now: () => Date;

  constructor(private readonly deps: TransactionsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /** "Hoje" no fuso do usuário — o servidor roda em UTC e não serve para decidir passado/futuro. */
  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  async list(userId: string, query: ListTransactionsQuery) {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const page = await this.deps.transactions.list(
      userId,
      {
        accountId: query.accountId,
        categoryId: query.categoryId,
        type: query.type,
        status: query.status,
        from: query.from,
        to: query.to,
        q: query.q,
        includeCancelled: query.includeCancelled ?? false,
      },
      { limit, cursor: query.cursor ? decodeCursor(query.cursor) : undefined },
    );
    return {
      items: page.items,
      nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    };
  }

  async get(userId: string, id: string): Promise<TransactionRecord> {
    return this.require(await this.deps.transactions.findById(userId, id));
  }

  async create(userId: string, input: CreateTransactionRequest): Promise<TransactionRecord> {
    const today = await this.today(userId);
    const status = resolveInitialStatus(input.status, input.transactionDate, today);

    const account = await this.requireAccount(userId, input.accountId);
    assertAccountAcceptsEntry(account, input.type);
    if (input.categoryId) await this.requireFittingCategory(userId, input.categoryId, input.type);

    return this.deps.transactions.create(userId, {
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      type: input.type,
      amountCents: input.amountCents,
      description: input.description ?? '',
      transactionDate: input.transactionDate,
      paymentMethod: input.paymentMethod ?? null,
      status,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTransactionRequest,
  ): Promise<TransactionRecord> {
    const current = await this.get(userId, id);
    if (current.transfer) throw new ConflictError(TRANSFER_LEG_MESSAGE);
    assertEditable(current.status);

    const today = await this.today(userId);
    assertCompletedDateNotFuture(
      current.status,
      input.transactionDate ?? current.transactionDate,
      today,
    );

    if (input.accountId !== undefined && input.accountId !== current.accountId) {
      const account = await this.requireAccount(userId, input.accountId);
      assertAccountAcceptsEntry(account, current.type);
    }
    if (input.categoryId) await this.requireFittingCategory(userId, input.categoryId, current.type);

    const patch: TransactionPatch = {
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.transactionDate !== undefined ? { transactionDate: input.transactionDate } : {}),
      ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
    };
    return this.require(await this.deps.transactions.update(userId, id, patch));
  }

  /** Pendente → efetivado. Idempotente se já estiver efetivado. */
  async complete(
    userId: string,
    id: string,
    input: CompleteRequest = {},
  ): Promise<TransactionRecord> {
    const current = await this.get(userId, id);
    if (current.transfer) throw new ConflictError(TRANSFER_LEG_MESSAGE);
    if (current.status === 'cancelled') {
      throw new ConflictError('Lançamento cancelado não pode ser efetivado.');
    }
    if (current.status === 'completed') return current;

    const date = resolveCompletionDate(
      current.transactionDate,
      input.transactionDate,
      await this.today(userId),
    );
    return this.require(
      await this.deps.transactions.setStatus(userId, id, {
        status: 'completed',
        transactionDate: date,
      }),
    );
  }

  /** Cancela (nunca apaga): o histórico permanece, mas o lançamento deixa de contar. Idempotente. */
  async cancel(userId: string, id: string): Promise<TransactionRecord> {
    const current = await this.get(userId, id);
    if (current.transfer) throw new ConflictError(TRANSFER_LEG_MESSAGE);
    if (current.status === 'cancelled') return current;
    return this.require(
      await this.deps.transactions.setStatus(userId, id, { status: 'cancelled' }),
    );
  }

  private async requireAccount(userId: string, accountId: string) {
    const account = await this.deps.accounts.findById(userId, accountId);
    // Conta inexistente OU de outro usuário: mesma resposta (não revela a existência).
    if (!account) throw new NotFoundError('Conta não encontrada.');
    return account;
  }

  private async requireFittingCategory(userId: string, categoryId: string, type: TransactionType) {
    const category = await this.deps.categories.findById(userId, categoryId);
    if (!category) throw new NotFoundError('Categoria não encontrada.');
    assertCategoryFits(category, type);
  }

  private require(record: TransactionRecord | undefined): TransactionRecord {
    if (!record) throw new NotFoundError('Lançamento não encontrado.');
    return record;
  }
}
