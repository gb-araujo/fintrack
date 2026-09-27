import { and, asc, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { accounts, recurringTransactions, transactions } from '../../db/schema/index.js';
import type {
  NewRecurring,
  RecurringPatch,
  RecurringRecord,
  RecurringWithAccount,
} from './recurring.types.js';

export interface RecurringRepository {
  list(userId: string, options: { includeInactive: boolean }): Promise<RecurringRecord[]>;
  findById(userId: string, id: string): Promise<RecurringRecord | undefined>;
  create(userId: string, input: NewRecurring): Promise<RecurringRecord>;
  update(userId: string, id: string, patch: RecurringPatch): Promise<RecurringRecord | undefined>;
  setActive(userId: string, id: string, active: boolean): Promise<RecurringRecord | undefined>;
  /** Regras ativas com dados da conta (para previsões e confirmação automática). */
  listActiveWithAccounts(userId: string): Promise<RecurringWithAccount[]>;
  /** Ocorrências que JÁ viraram lançamento (qualquer status) na janela: não são mais previsão. */
  linkedOccurrences(
    userId: string,
    from: string,
    to: string,
  ): Promise<{ recurringId: string; occurrenceDate: string }[]>;
  /** Último valor efetivado de cada recorrência (estimativa para contas variáveis). */
  lastConfirmedAmounts(userId: string): Promise<Map<string, number>>;
}

const columns = {
  id: recurringTransactions.id,
  name: recurringTransactions.name,
  type: recurringTransactions.type,
  amountCents: recurringTransactions.amountCents,
  isVariableAmount: recurringTransactions.isVariableAmount,
  accountId: recurringTransactions.accountId,
  categoryId: recurringTransactions.categoryId,
  frequency: recurringTransactions.frequency,
  interval: recurringTransactions.interval,
  dayOfMonth: recurringTransactions.dayOfMonth,
  startDate: recurringTransactions.startDate,
  endDate: recurringTransactions.endDate,
  autoConfirm: recurringTransactions.autoConfirm,
  includeInForecast: recurringTransactions.includeInForecast,
  active: recurringTransactions.active,
  createdAt: recurringTransactions.createdAt,
};

type Row = Omit<RecurringRecord, 'type'> & { type: string };

function toRecord(row: Row): RecurringRecord {
  return { ...row, type: row.type === 'income' ? 'income' : 'expense' };
}

export class DrizzleRecurringRepository implements RecurringRepository {
  constructor(private readonly db: DrizzleDb) {}

  async list(userId: string, { includeInactive }: { includeInactive: boolean }) {
    const rows = await this.db
      .select(columns)
      .from(recurringTransactions)
      .where(
        and(
          eq(recurringTransactions.userId, userId),
          includeInactive ? undefined : eq(recurringTransactions.active, true),
        ),
      )
      .orderBy(asc(recurringTransactions.name), asc(recurringTransactions.id));
    return rows.map(toRecord);
  }

  async findById(userId: string, id: string) {
    const [row] = await this.db
      .select(columns)
      .from(recurringTransactions)
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .limit(1);
    return row ? toRecord(row) : undefined;
  }

  async create(userId: string, input: NewRecurring) {
    const [row] = await this.db
      .insert(recurringTransactions)
      .values({ userId, ...input })
      .returning(columns);
    if (!row) throw new Error('INSERT em recurring_transactions não retornou linha');
    return toRecord(row);
  }

  async update(userId: string, id: string, patch: RecurringPatch) {
    const [row] = await this.db
      .update(recurringTransactions)
      .set(patch)
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .returning(columns);
    return row ? toRecord(row) : undefined;
  }

  async setActive(userId: string, id: string, active: boolean) {
    const [row] = await this.db
      .update(recurringTransactions)
      .set({ active })
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.id, id)))
      .returning(columns);
    return row ? toRecord(row) : undefined;
  }

  async listActiveWithAccounts(userId: string): Promise<RecurringWithAccount[]> {
    const rows = await this.db
      .select({
        ...columns,
        archivedAt: accounts.archivedAt,
        accountType: accounts.type,
        includeInAvailable: accounts.includeInAvailable,
      })
      .from(recurringTransactions)
      .innerJoin(
        accounts,
        and(
          eq(accounts.id, recurringTransactions.accountId),
          eq(accounts.userId, recurringTransactions.userId),
        ),
      )
      .where(and(eq(recurringTransactions.userId, userId), eq(recurringTransactions.active, true)))
      .orderBy(asc(recurringTransactions.id));

    return rows.map(({ archivedAt, accountType, includeInAvailable, ...rule }) => ({
      ...toRecord(rule),
      accountLiquid: archivedAt === null && accountType !== 'investment' && includeInAvailable,
      accountUsable: archivedAt === null && accountType !== 'investment',
    }));
  }

  async linkedOccurrences(userId: string, from: string, to: string) {
    const rows = await this.db
      .select({
        recurringId: transactions.recurringTransactionId,
        occurrenceDate: transactions.occurrenceDate,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.recurringTransactionId),
          gte(transactions.occurrenceDate, from),
          lte(transactions.occurrenceDate, to),
        ),
      );
    return rows.flatMap((row) =>
      row.recurringId && row.occurrenceDate
        ? [{ recurringId: row.recurringId, occurrenceDate: row.occurrenceDate }]
        : [],
    );
  }

  async lastConfirmedAmounts(userId: string) {
    const rows = await this.db
      .selectDistinctOn([transactions.recurringTransactionId], {
        recurringId: transactions.recurringTransactionId,
        amountCents: transactions.amountCents,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          isNotNull(transactions.recurringTransactionId),
          eq(transactions.status, 'completed'),
        ),
      )
      .orderBy(
        transactions.recurringTransactionId,
        desc(transactions.occurrenceDate),
        sql`${transactions.createdAt} desc`,
      );
    const amounts = new Map<string, number>();
    for (const row of rows) if (row.recurringId) amounts.set(row.recurringId, row.amountCents);
    return amounts;
  }
}
