import { and, asc, eq, sql } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { importedTransactions, imports, merchantRules } from '../../db/schema/index.js';
import type {
  DetectedInfo,
  ExistingTransactionRow,
  ImportDetailRecord,
  ImportRecord,
  ImportedRowRecord,
  MerchantRuleRecord,
  NewImport,
  NewMerchantRule,
} from './imports.types.js';

/** Toda consulta filtra por `userId`: lote, linha ou regra de outro usuário nunca é encontrado. */
export interface ImportsRepository {
  /** Grava o lote e todas as linhas na MESMA transação. Devolve o id do lote. */
  create(userId: string, input: NewImport): Promise<string>;
  list(userId: string, limit: number): Promise<ImportRecord[]>;
  findById(userId: string, id: string): Promise<ImportDetailRecord | undefined>;
  /** Como `findById`, mas trava a linha do lote (`FOR UPDATE`) — só dentro de uma transação. */
  lockById(userId: string, id: string): Promise<ImportDetailRecord | undefined>;
  rows(userId: string, importId: string): Promise<ImportedRowRecord[]>;
  /** Impressões digitais de linhas JÁ importadas (lotes confirmados e não desfeitos) da conta. */
  priorFingerprints(
    userId: string,
    accountId: string,
    fingerprints: string[],
  ): Promise<Map<string, string | null>>;
  /** Lançamentos da conta (não cancelados) no período — base da detecção de possíveis duplicatas. */
  existingTransactions(
    userId: string,
    accountId: string,
    from: string,
    to: string,
  ): Promise<ExistingTransactionRow[]>;
  markRow(
    userId: string,
    rowId: string,
    change: {
      status: 'imported' | 'skipped';
      createdTransactionId?: string | null;
      createdTransferId?: string | null;
    },
  ): Promise<void>;
  setStatus(
    userId: string,
    id: string,
    status: 'confirmed' | 'cancelled' | 'reverted',
    confirmedAt?: Date,
  ): Promise<void>;
}

const num = (value: unknown): number => Number(value ?? 0);

const rowColumns = {
  id: importedTransactions.id,
  importId: importedTransactions.importId,
  rowNumber: importedTransactions.rowNumber,
  date: importedTransactions.transactionDate,
  amountCents: importedTransactions.amountCents,
  direction: importedTransactions.direction,
  description: importedTransactions.description,
  normalizedDescription: importedTransactions.descriptionNormalized,
  suggestedType: importedTransactions.suggestedType,
  suggestedCategoryId: importedTransactions.suggestedCategoryId,
  suggestedTargetAccountId: importedTransactions.suggestedTargetAccountId,
  suggestedInvoiceId: importedTransactions.suggestedInvoiceId,
  suggestionSource: importedTransactions.suggestionSource,
  duplicateKind: importedTransactions.duplicateKind,
  duplicateOfTransactionId: importedTransactions.duplicateOfTransactionId,
  defaultAction: importedTransactions.defaultAction,
  status: importedTransactions.status,
  createdTransactionId: importedTransactions.createdTransactionId,
  createdTransferId: importedTransactions.createdTransferId,
};

const INSERT_CHUNK = 500;

type ImportRow = {
  id: string;
  account_id: string;
  source: string;
  filename: string;
  status: string;
  detected: DetectedInfo;
  ignored_rows: { line: number; reason: string }[];
  ignored_rows_count: number;
  created_at: Date;
  confirmed_at: Date | null;
  rows_count: string;
  imported_count: string;
  skipped_count: string;
};

function toImport(row: ImportRow): ImportDetailRecord {
  return {
    id: row.id,
    accountId: row.account_id,
    source: row.source as ImportRecord['source'],
    filename: row.filename,
    status: row.status as ImportRecord['status'],
    rowsCount: num(row.rows_count),
    importedCount: num(row.imported_count),
    skippedCount: num(row.skipped_count),
    createdAt: new Date(row.created_at),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    detected: row.detected,
    ignoredRows: row.ignored_rows,
    ignoredRowsCount: row.ignored_rows_count,
  };
}

export class DrizzleImportsRepository implements ImportsRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(userId: string, input: NewImport) {
    return this.db.transaction(async (tx) => {
      const [created] = await tx
        .insert(imports)
        .values({
          userId,
          accountId: input.accountId,
          source: input.source,
          filename: input.filename,
          detected: input.detected,
          ignoredRows: input.ignoredRows,
          ignoredRowsCount: input.ignoredRowsCount,
        })
        .returning({ id: imports.id });
      if (!created) throw new Error('INSERT em imports não retornou linha');

      for (let offset = 0; offset < input.rows.length; offset += INSERT_CHUNK) {
        await tx.insert(importedTransactions).values(
          input.rows.slice(offset, offset + INSERT_CHUNK).map((row) => ({
            userId,
            importId: created.id,
            accountId: input.accountId,
            rowNumber: row.rowNumber,
            rawData: row.raw,
            transactionDate: row.date,
            amountCents: row.amountCents,
            direction: row.direction,
            description: row.description,
            descriptionNormalized: row.normalizedDescription,
            fingerprint: row.fingerprint,
            externalId: row.externalId,
            suggestedType: row.suggestedType,
            suggestedCategoryId: row.suggestedCategoryId,
            suggestedTargetAccountId: row.suggestedTargetAccountId,
            suggestedInvoiceId: row.suggestedInvoiceId,
            suggestionSource: row.suggestionSource,
            duplicateKind: row.duplicateKind,
            duplicateOfTransactionId: row.duplicateOfTransactionId,
            defaultAction: row.defaultAction,
          })),
        );
      }
      return created.id;
    });
  }

  private async select(where: ReturnType<typeof sql>): Promise<ImportDetailRecord[]> {
    const rows = await this.db.execute<ImportRow>(sql`
      select i.id, i.account_id, i.source, i.filename, i.status, i.detected, i.ignored_rows,
             i.ignored_rows_count, i.created_at, i.confirmed_at,
             (select count(*) from imported_transactions r where r.import_id = i.id) as rows_count,
             (select count(*) from imported_transactions r where r.import_id = i.id and r.status = 'imported') as imported_count,
             (select count(*) from imported_transactions r where r.import_id = i.id and r.status = 'skipped') as skipped_count
      from imports i
      where ${where}
      order by i.created_at desc, i.id desc`);
    return rows.map(toImport);
  }

  async list(userId: string, limit: number) {
    const rows = await this.select(sql`i.user_id = ${userId}`);
    return rows.slice(0, limit);
  }

  async findById(userId: string, id: string) {
    const [row] = await this.select(sql`i.user_id = ${userId} and i.id = ${id}`);
    return row;
  }

  async lockById(userId: string, id: string) {
    const [locked] = await this.db
      .select({ id: imports.id })
      .from(imports)
      .where(and(eq(imports.userId, userId), eq(imports.id, id)))
      .for('update');
    return locked ? this.findById(userId, id) : undefined;
  }

  async rows(userId: string, importId: string) {
    const rows = await this.db
      .select(rowColumns)
      .from(importedTransactions)
      .where(
        and(eq(importedTransactions.userId, userId), eq(importedTransactions.importId, importId)),
      )
      .orderBy(asc(importedTransactions.rowNumber));
    return rows as ImportedRowRecord[];
  }

  async priorFingerprints(userId: string, accountId: string, fingerprints: string[]) {
    const result = new Map<string, string | null>();
    for (let offset = 0; offset < fingerprints.length; offset += INSERT_CHUNK) {
      const chunk = fingerprints.slice(offset, offset + INSERT_CHUNK);
      const rows = await this.db.execute<{
        fingerprint: string;
        transaction_id: string | null;
      }>(sql`
        select r.fingerprint,
               coalesce(
                 r.created_transaction_id,
                 (select t.id from transactions t
                   where t.user_id = r.user_id and t.transfer_id = r.created_transfer_id
                     and t.account_id = r.account_id
                   limit 1)
               ) as transaction_id
        from imported_transactions r
        join imports i on i.id = r.import_id and i.user_id = r.user_id
        where r.user_id = ${userId} and r.account_id = ${accountId}
          and r.status = 'imported' and i.status = 'confirmed'
          and r.fingerprint in (${sql.join(
            chunk.map((fingerprint) => sql`${fingerprint}`),
            sql`, `,
          )})`);
      for (const row of rows) result.set(row.fingerprint, row.transaction_id);
    }
    return result;
  }

  async existingTransactions(userId: string, accountId: string, from: string, to: string) {
    const rows = await this.db.execute<{
      id: string;
      date: string;
      signed_cents: string;
      description: string;
    }>(sql`
      select t.id, t.transaction_date::text as date, t.description,
             case
               when t.type = 'income' then t.amount_cents
               when t.type = 'transfer' and t.transfer_direction = 'in' then t.amount_cents
               else -t.amount_cents
             end as signed_cents
      from transactions t
      where t.user_id = ${userId} and t.account_id = ${accountId}
        and t.status <> 'cancelled'
        and t.transaction_date between ${from}::date and ${to}::date`);
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      signedCents: num(row.signed_cents),
      description: row.description,
    }));
  }

  async markRow(
    userId: string,
    rowId: string,
    change: {
      status: 'imported' | 'skipped';
      createdTransactionId?: string | null;
      createdTransferId?: string | null;
    },
  ) {
    await this.db
      .update(importedTransactions)
      .set({
        status: change.status,
        createdTransactionId: change.createdTransactionId ?? null,
        createdTransferId: change.createdTransferId ?? null,
      })
      .where(and(eq(importedTransactions.userId, userId), eq(importedTransactions.id, rowId)));
  }

  async setStatus(
    userId: string,
    id: string,
    status: 'confirmed' | 'cancelled' | 'reverted',
    confirmedAt?: Date,
  ) {
    await this.db
      .update(imports)
      .set({ status, ...(confirmedAt ? { confirmedAt } : {}) })
      .where(and(eq(imports.userId, userId), eq(imports.id, id)));
  }
}

// ---------- Regras de comerciante ----------

export interface MerchantRulesRepository {
  list(userId: string): Promise<MerchantRuleRecord[]>;
  findById(userId: string, id: string): Promise<MerchantRuleRecord | undefined>;
  /** Cria ou atualiza (mesmo tipo de casamento + texto): salvar a mesma regra duas vezes não duplica. */
  upsert(userId: string, input: NewMerchantRule): Promise<MerchantRuleRecord>;
  remove(userId: string, id: string): Promise<boolean>;
}

const ruleColumns = {
  id: merchantRules.id,
  pattern: merchantRules.pattern,
  matchType: merchantRules.matchType,
  suggestedType: merchantRules.suggestedType,
  categoryId: merchantRules.categoryId,
  targetAccountId: merchantRules.targetAccountId,
  priority: merchantRules.priority,
  createdAt: merchantRules.createdAt,
};

export class DrizzleMerchantRulesRepository implements MerchantRulesRepository {
  constructor(private readonly db: DrizzleDb) {}

  async list(userId: string) {
    const rows = await this.db
      .select(ruleColumns)
      .from(merchantRules)
      .where(eq(merchantRules.userId, userId))
      .orderBy(asc(merchantRules.createdAt), asc(merchantRules.id));
    return rows as MerchantRuleRecord[];
  }

  async findById(userId: string, id: string) {
    const [row] = await this.db
      .select(ruleColumns)
      .from(merchantRules)
      .where(and(eq(merchantRules.userId, userId), eq(merchantRules.id, id)))
      .limit(1);
    return row as MerchantRuleRecord | undefined;
  }

  async upsert(userId: string, input: NewMerchantRule) {
    const [row] = await this.db
      .insert(merchantRules)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: [merchantRules.userId, merchantRules.matchType, merchantRules.pattern],
        set: {
          suggestedType: input.suggestedType,
          categoryId: input.categoryId,
          targetAccountId: input.targetAccountId,
          priority: input.priority,
        },
      })
      .returning(ruleColumns);
    if (!row) throw new Error('UPSERT em merchant_rules não retornou linha');
    return row as MerchantRuleRecord;
  }

  async remove(userId: string, id: string) {
    const deleted = await this.db
      .delete(merchantRules)
      .where(and(eq(merchantRules.userId, userId), eq(merchantRules.id, id)))
      .returning({ id: merchantRules.id });
    return deleted.length > 0;
  }
}
