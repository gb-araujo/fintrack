import { and, asc, eq, isNull, type SQL } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { completedEffectSql } from '../../db/expressions.js';
import { accounts, transactions } from '../../db/schema/index.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import type { AccountRecord, CreateAccountInput, UpdateAccountInput } from './accounts.types.js';

/**
 * Toda consulta recebe `userId` e o aplica em TODOS os filtros: não existe método
 * "buscar por id" sem usuário. Recurso de outro usuário simplesmente não é encontrado.
 */
export interface AccountsRepository {
  list(userId: string, options: { includeArchived: boolean }): Promise<AccountRecord[]>;
  findById(userId: string, id: string): Promise<AccountRecord | undefined>;
  create(userId: string, input: CreateAccountInput): Promise<AccountRecord>;
  update(userId: string, id: string, input: UpdateAccountInput): Promise<AccountRecord | undefined>;
  setArchived(userId: string, id: string, archived: boolean): Promise<AccountRecord | undefined>;
}

const NAME_TAKEN = 'Já existe uma conta ativa com esse nome.';

export class DrizzleAccountsRepository implements AccountsRepository {
  constructor(private readonly db: DrizzleDb) {}

  /** Contas com saldo calculado em uma única consulta (saldo inicial + efetivados). */
  private async select(where: SQL | undefined): Promise<AccountRecord[]> {
    const rows = await this.db
      .select({
        id: accounts.id,
        name: accounts.name,
        type: accounts.type,
        initialBalanceCents: accounts.initialBalanceCents,
        includeInAvailable: accounts.includeInAvailable,
        archivedAt: accounts.archivedAt,
        createdAt: accounts.createdAt,
        effectCents: completedEffectSql,
      })
      .from(accounts)
      .leftJoin(
        transactions,
        and(eq(transactions.accountId, accounts.id), eq(transactions.userId, accounts.userId)),
      )
      .where(where)
      .groupBy(accounts.id)
      .orderBy(asc(accounts.archivedAt), asc(accounts.createdAt), asc(accounts.id));

    return rows.map(({ effectCents, ...account }) => ({
      ...account,
      balanceCents: account.initialBalanceCents + effectCents,
    }));
  }

  list(userId: string, { includeArchived }: { includeArchived: boolean }) {
    return this.select(
      includeArchived
        ? eq(accounts.userId, userId)
        : and(eq(accounts.userId, userId), isNull(accounts.archivedAt)),
    );
  }

  async findById(userId: string, id: string) {
    const [row] = await this.select(and(eq(accounts.userId, userId), eq(accounts.id, id)));
    return row;
  }

  async create(userId: string, input: CreateAccountInput) {
    try {
      const [created] = await this.db
        .insert(accounts)
        .values({ userId, ...input })
        .returning({ id: accounts.id });
      if (!created) throw new Error('INSERT em accounts não retornou linha');
      const account = await this.findById(userId, created.id);
      if (!account) throw new Error('Conta recém-criada não encontrada');
      return account;
    } catch (error) {
      if (isUniqueViolation(error, 'accounts_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }

  async update(userId: string, id: string, input: UpdateAccountInput) {
    try {
      const [updated] = await this.db
        .update(accounts)
        .set(input)
        .where(and(eq(accounts.userId, userId), eq(accounts.id, id)))
        .returning({ id: accounts.id });
      return updated ? await this.findById(userId, updated.id) : undefined;
    } catch (error) {
      if (isUniqueViolation(error, 'accounts_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }

  async setArchived(userId: string, id: string, archived: boolean) {
    try {
      const [updated] = await this.db
        .update(accounts)
        .set({ archivedAt: archived ? new Date() : null })
        .where(and(eq(accounts.userId, userId), eq(accounts.id, id)))
        .returning({ id: accounts.id });
      return updated ? await this.findById(userId, updated.id) : undefined;
    } catch (error) {
      // Desarquivar uma conta cujo nome foi reutilizado por outra conta ativa.
      if (isUniqueViolation(error, 'accounts_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }
}
