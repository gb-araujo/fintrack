import { sql, type SQL } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { accounts } from '../../db/schema/index.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import type { AccountRecord, CreateAccountInput, UpdateAccountInput } from './accounts.types.js';
import type { AccountType } from '@fintrack/shared';

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

type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  initial_balance_cents: string;
  include_in_available: boolean;
  // db.execute() não decodifica colunas como o query builder: timestamptz vem como string bruta.
  archived_at: string | null;
  created_at: string;
  balance_cents: string;
};

export class DrizzleAccountsRepository implements AccountsRepository {
  constructor(private readonly db: DrizzleDb) {}

  /**
   * Contas com saldo calculado em uma única consulta. Regra (ADR 0002, ADR 0020):
   * - conta comum: saldo inicial + Σ efeito dos lançamentos efetivados (igual a `balanceEffect`);
   * - conta de investimento COM avaliação: a avaliação mais recente + Σ efeito dos lançamentos
   *   efetivados com data DEPOIS dela (aplicações/resgates registrados desde então). Sem avaliação
   *   nenhuma, cai na mesma regra das contas comuns (saldo = aportes, rendimento ainda não medido).
   */
  private async select(userId: string, extra?: SQL): Promise<AccountRecord[]> {
    const rows = await this.db.execute<AccountRow>(sql`
      select a.id, a.name, a.type, a.initial_balance_cents, a.include_in_available,
             a.archived_at, a.created_at,
             coalesce(v.balance_cents, a.initial_balance_cents) + coalesce(e.effect, 0) as balance_cents
      from accounts a
      left join lateral (
        select balance_cents, date
        from investment_valuations
        where account_id = a.id and user_id = a.user_id
        order by date desc
        limit 1
      ) v on a.type = 'investment'
      left join lateral (
        select sum(
          case
            when t.type = 'income' then t.amount_cents
            when t.type = 'transfer' and t.transfer_direction = 'in' then t.amount_cents
            else -t.amount_cents
          end
        ) as effect
        from transactions t
        where t.account_id = a.id and t.user_id = a.user_id and t.status = 'completed'
          and (v.date is null or t.transaction_date > v.date)
      ) e on true
      where a.user_id = ${userId} ${extra ? sql`and ${extra}` : sql``}
      order by a.archived_at asc, a.created_at asc, a.id asc`);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      initialBalanceCents: Number(row.initial_balance_cents),
      includeInAvailable: row.include_in_available,
      archivedAt: row.archived_at ? new Date(row.archived_at) : null,
      createdAt: new Date(row.created_at),
      balanceCents: Number(row.balance_cents),
    }));
  }

  list(userId: string, { includeArchived }: { includeArchived: boolean }) {
    return this.select(userId, includeArchived ? undefined : sql`a.archived_at is null`);
  }

  async findById(userId: string, id: string) {
    const [row] = await this.select(userId, sql`a.id = ${id}`);
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
