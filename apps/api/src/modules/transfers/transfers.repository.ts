import { and, eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { transactions, transfers } from '../../db/schema/index.js';
import type { TransferRecord, TransferValues } from './transfers.types.js';

export interface TransfersRepository {
  /** Cria o cabeçalho e as DUAS pernas (saída e entrada) na mesma transação SQL. */
  create(userId: string, values: TransferValues): Promise<TransferRecord>;
  findById(userId: string, id: string): Promise<TransferRecord | undefined>;
  /** Atualiza cabeçalho e as duas pernas juntos, sob trava da linha (edições concorrentes). */
  replace(userId: string, id: string, values: TransferValues): Promise<TransferRecord | undefined>;
}

const columns = {
  id: transfers.id,
  fromAccountId: transfers.fromAccountId,
  toAccountId: transfers.toAccountId,
  amountCents: transfers.amountCents,
  transferDate: transfers.transferDate,
  status: transfers.status,
  description: transfers.description,
  createdAt: transfers.createdAt,
  updatedAt: transfers.updatedAt,
};

export class DrizzleTransfersRepository implements TransfersRepository {
  constructor(private readonly db: DrizzleDb) {}

  async create(userId: string, values: TransferValues) {
    return this.db.transaction(async (tx) => {
      const [transfer] = await tx
        .insert(transfers)
        .values({ userId, ...values })
        .returning(columns);
      if (!transfer) throw new Error('INSERT em transfers não retornou linha');

      const leg = { userId, transferId: transfer.id, type: 'transfer' as const };
      const shared = {
        amountCents: values.amountCents,
        description: values.description,
        transactionDate: values.transferDate,
        status: values.status,
      };
      await tx.insert(transactions).values([
        { ...leg, ...shared, accountId: values.fromAccountId, transferDirection: 'out' },
        { ...leg, ...shared, accountId: values.toAccountId, transferDirection: 'in' },
      ]);
      return transfer;
    });
  }

  async findById(userId: string, id: string) {
    const [row] = await this.db
      .select(columns)
      .from(transfers)
      .where(and(eq(transfers.userId, userId), eq(transfers.id, id)))
      .limit(1);
    return row;
  }

  async replace(userId: string, id: string, values: TransferValues) {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: transfers.id })
        .from(transfers)
        .where(and(eq(transfers.userId, userId), eq(transfers.id, id)))
        .for('update');
      if (!locked) return undefined;

      const [transfer] = await tx
        .update(transfers)
        .set(values)
        .where(and(eq(transfers.userId, userId), eq(transfers.id, id)))
        .returning(columns);

      const shared = {
        amountCents: values.amountCents,
        description: values.description,
        transactionDate: values.transferDate,
        status: values.status,
      };
      const legs = and(eq(transactions.userId, userId), eq(transactions.transferId, id));
      await tx
        .update(transactions)
        .set({ ...shared, accountId: values.fromAccountId })
        .where(and(legs, eq(transactions.transferDirection, 'out')));
      await tx
        .update(transactions)
        .set({ ...shared, accountId: values.toAccountId })
        .where(and(legs, eq(transactions.transferDirection, 'in')));
      return transfer;
    });
  }
}
