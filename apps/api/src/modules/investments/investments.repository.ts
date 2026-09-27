import { and, asc, eq, gt, lte } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { completedEffectSql } from '../../db/expressions.js';
import { investmentDetails, investmentValuations, transactions } from '../../db/schema/index.js';

export interface ValuationRow {
  id: string;
  accountId: string;
  date: string;
  balanceCents: number;
  note: string | null;
  createdAt: Date;
}

export interface InvestmentDetailsRecord {
  institution: string | null;
  product: string | null;
}

export interface InvestmentsRepository {
  /** Histórico completo, do mais antigo ao mais recente — nunca paginado nem descartado. */
  listValuations(userId: string, accountId: string): Promise<ValuationRow[]>;
  /** Cria a avaliação da data, ou atualiza se já existir uma na mesma data (nunca duas por dia). */
  upsertValuation(
    userId: string,
    accountId: string,
    input: { date: string; balanceCents: number; note: string | null },
  ): Promise<ValuationRow>;
  deleteValuation(userId: string, accountId: string, id: string): Promise<boolean>;
  /**
   * Efeito líquido (aportes − resgates, em centavos com sinal) dos lançamentos efetivados da conta
   * no intervalo `(after, upTo]`. Mesma fórmula do saldo (`completedEffectSql`) — é o que sobra do
   * saldo depois de descontar o que o mercado rendeu.
   */
  netContributed(
    userId: string,
    accountId: string,
    range: { after?: string; upTo?: string },
  ): Promise<number>;
  getDetails(userId: string, accountId: string): Promise<InvestmentDetailsRecord | undefined>;
  upsertDetails(
    userId: string,
    accountId: string,
    input: InvestmentDetailsRecord,
  ): Promise<InvestmentDetailsRecord>;
}

export class DrizzleInvestmentsRepository implements InvestmentsRepository {
  constructor(private readonly db: DrizzleDb) {}

  listValuations(userId: string, accountId: string) {
    return this.db
      .select({
        id: investmentValuations.id,
        accountId: investmentValuations.accountId,
        date: investmentValuations.date,
        balanceCents: investmentValuations.balanceCents,
        note: investmentValuations.note,
        createdAt: investmentValuations.createdAt,
      })
      .from(investmentValuations)
      .where(
        and(eq(investmentValuations.userId, userId), eq(investmentValuations.accountId, accountId)),
      )
      .orderBy(asc(investmentValuations.date));
  }

  async upsertValuation(
    userId: string,
    accountId: string,
    input: { date: string; balanceCents: number; note: string | null },
  ) {
    const [row] = await this.db
      .insert(investmentValuations)
      .values({ userId, accountId, ...input })
      .onConflictDoUpdate({
        target: [investmentValuations.accountId, investmentValuations.date],
        set: { balanceCents: input.balanceCents, note: input.note },
      })
      .returning({
        id: investmentValuations.id,
        accountId: investmentValuations.accountId,
        date: investmentValuations.date,
        balanceCents: investmentValuations.balanceCents,
        note: investmentValuations.note,
        createdAt: investmentValuations.createdAt,
      });
    if (!row) throw new Error('UPSERT em investment_valuations não retornou linha');
    return row;
  }

  async deleteValuation(userId: string, accountId: string, id: string) {
    const deleted = await this.db
      .delete(investmentValuations)
      .where(
        and(
          eq(investmentValuations.userId, userId),
          eq(investmentValuations.accountId, accountId),
          eq(investmentValuations.id, id),
        ),
      )
      .returning({ id: investmentValuations.id });
    return deleted.length > 0;
  }

  async netContributed(
    userId: string,
    accountId: string,
    { after, upTo }: { after?: string; upTo?: string },
  ) {
    const [row] = await this.db
      .select({ effect: completedEffectSql })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.accountId, accountId),
          after ? gt(transactions.transactionDate, after) : undefined,
          upTo ? lte(transactions.transactionDate, upTo) : undefined,
        ),
      );
    return row?.effect ?? 0;
  }

  async getDetails(userId: string, accountId: string) {
    const [row] = await this.db
      .select({ institution: investmentDetails.institution, product: investmentDetails.product })
      .from(investmentDetails)
      .where(and(eq(investmentDetails.userId, userId), eq(investmentDetails.accountId, accountId)))
      .limit(1);
    return row;
  }

  async upsertDetails(userId: string, accountId: string, input: InvestmentDetailsRecord) {
    const [row] = await this.db
      .insert(investmentDetails)
      .values({ userId, accountId, ...input })
      .onConflictDoUpdate({
        target: [investmentDetails.accountId],
        set: { institution: input.institution, product: input.product },
      })
      .returning({
        institution: investmentDetails.institution,
        product: investmentDetails.product,
      });
    if (!row) throw new Error('UPSERT em investment_details não retornou linha');
    return row;
  }
}
