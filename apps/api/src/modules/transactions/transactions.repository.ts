import type {
  PaymentMethod,
  TransactionStatus,
  TransactionType,
  TransferDirection,
} from '@fintrack/shared';
import { and, desc, eq, gte, ilike, lte, ne, sql, type SQL } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import { transactions, transfers } from '../../db/schema/index.js';
import type {
  NewTransaction,
  PageCursor,
  TransactionFilters,
  TransactionPage,
  TransactionPatch,
  TransactionRecord,
} from './transactions.types.js';

/** Toda consulta filtra por `userId`: um lançamento de outro usuário nunca é encontrado. */
export interface TransactionsRepository {
  list(
    userId: string,
    filters: TransactionFilters,
    page: { limit: number; cursor?: PageCursor | undefined },
  ): Promise<TransactionPage>;
  findById(userId: string, id: string): Promise<TransactionRecord | undefined>;
  create(userId: string, input: NewTransaction): Promise<TransactionRecord>;
  update(
    userId: string,
    id: string,
    patch: TransactionPatch,
  ): Promise<TransactionRecord | undefined>;
  setStatus(
    userId: string,
    id: string,
    change: { status: 'completed' | 'cancelled'; transactionDate?: string },
  ): Promise<TransactionRecord | undefined>;
}

const columns = {
  id: transactions.id,
  accountId: transactions.accountId,
  categoryId: transactions.categoryId,
  type: transactions.type,
  amountCents: transactions.amountCents,
  description: transactions.description,
  transactionDate: transactions.transactionDate,
  paymentMethod: transactions.paymentMethod,
  status: transactions.status,
  transferId: transactions.transferId,
  recurringId: transactions.recurringTransactionId,
  transferDirection: transactions.transferDirection,
  fromAccountId: transfers.fromAccountId,
  toAccountId: transfers.toAccountId,
  createdAt: transactions.createdAt,
  updatedAt: transactions.updatedAt,
};

interface Row {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  amountCents: number;
  description: string;
  transactionDate: string;
  paymentMethod: PaymentMethod | null;
  status: TransactionStatus;
  transferId: string | null;
  recurringId: string | null;
  transferDirection: TransferDirection | null;
  /** Vêm do LEFT JOIN com transfers: nulos quando o lançamento não é perna de transferência. */
  fromAccountId: string | null;
  toAccountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toRecord(row: Row): TransactionRecord {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: row.type,
    amountCents: row.amountCents,
    description: row.description,
    transactionDate: row.transactionDate,
    paymentMethod: row.paymentMethod,
    status: row.status,
    recurringId: row.recurringId,
    transfer:
      row.transferId && row.transferDirection && row.fromAccountId && row.toAccountId
        ? {
            id: row.transferId,
            direction: row.transferDirection,
            fromAccountId: row.fromAccountId,
            toAccountId: row.toAccountId,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Escapa % _ \ para busca literal com ILIKE. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export class DrizzleTransactionsRepository implements TransactionsRepository {
  constructor(private readonly db: DrizzleDb) {}

  private base() {
    return this.db
      .select({ ...columns, createdAtText: sql<string>`${transactions.createdAt}::text` })
      .from(transactions)
      .leftJoin(
        transfers,
        and(eq(transfers.id, transactions.transferId), eq(transfers.userId, transactions.userId)),
      );
  }

  async list(
    userId: string,
    filters: TransactionFilters,
    page: { limit: number; cursor?: PageCursor | undefined },
  ): Promise<TransactionPage> {
    const conditions: (SQL | undefined)[] = [
      eq(transactions.userId, userId),
      filters.accountId ? eq(transactions.accountId, filters.accountId) : undefined,
      filters.categoryId ? eq(transactions.categoryId, filters.categoryId) : undefined,
      filters.type ? eq(transactions.type, filters.type) : undefined,
      // Cancelados ficam ocultos, a menos que se peça ou se filtre por status.
      filters.status
        ? eq(transactions.status, filters.status)
        : filters.includeCancelled
          ? undefined
          : ne(transactions.status, 'cancelled'),
      filters.from ? gte(transactions.transactionDate, filters.from) : undefined,
      filters.to ? lte(transactions.transactionDate, filters.to) : undefined,
      filters.q ? ilike(transactions.description, `%${escapeLike(filters.q)}%`) : undefined,
      page.cursor
        ? sql`(${transactions.transactionDate}, ${transactions.createdAt}, ${transactions.id}) < (${page.cursor.date}::date, ${page.cursor.createdAt}::timestamptz, ${page.cursor.id}::uuid)`
        : undefined,
    ];

    const rows = await this.base()
      .where(and(...conditions))
      .orderBy(
        desc(transactions.transactionDate),
        desc(transactions.createdAt),
        desc(transactions.id),
      )
      .limit(page.limit + 1);

    const hasMore = rows.length > page.limit;
    const pageRows = hasMore ? rows.slice(0, page.limit) : rows;
    const last = pageRows.at(-1);

    return {
      items: pageRows.map(toRecord),
      nextCursor:
        hasMore && last?.createdAtText
          ? { date: last.transactionDate, createdAt: last.createdAtText, id: last.id }
          : null,
    };
  }

  async findById(userId: string, id: string) {
    const [row] = await this.base()
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
      .limit(1);
    return row ? toRecord(row) : undefined;
  }

  async create(userId: string, input: NewTransaction) {
    const { recurring, ...values } = input;
    let created: { id: string } | undefined;
    try {
      [created] = await this.db
        .insert(transactions)
        .values({
          userId,
          ...values,
          ...(recurring
            ? { recurringTransactionId: recurring.id, occurrenceDate: recurring.occurrenceDate }
            : {}),
        })
        .returning({ id: transactions.id });
    } catch (error) {
      // UNIQUE (recurring_transaction_id, occurrence_date): cada ocorrência vira no máximo um lançamento.
      if (isUniqueViolation(error, 'transactions_recurring_occurrence_unique')) {
        throw new ConflictError('Esta ocorrência já foi confirmada ou pulada.');
      }
      throw error;
    }
    if (!created) throw new Error('INSERT em transactions não retornou linha');
    const record = await this.findById(userId, created.id);
    if (!record) throw new Error('Lançamento recém-criado não encontrado');
    return record;
  }

  async update(userId: string, id: string, patch: TransactionPatch) {
    const [updated] = await this.db
      .update(transactions)
      .set(patch)
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
      .returning({ id: transactions.id });
    return updated ? this.findById(userId, updated.id) : undefined;
  }

  async setStatus(
    userId: string,
    id: string,
    change: { status: 'completed' | 'cancelled'; transactionDate?: string },
  ) {
    const [updated] = await this.db
      .update(transactions)
      .set({
        status: change.status,
        ...(change.transactionDate ? { transactionDate: change.transactionDate } : {}),
      })
      .where(and(eq(transactions.userId, userId), eq(transactions.id, id)))
      .returning({ id: transactions.id });
    return updated ? this.findById(userId, updated.id) : undefined;
  }
}
