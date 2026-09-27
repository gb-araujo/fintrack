import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import {
  creditCardInstallments,
  creditCardInvoices,
  creditCards,
  creditCardTransactions,
  transactions,
} from '../../db/schema/index.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import { DrizzleTransactionsRepository } from '../transactions/transactions.repository.js';
import type { TransactionRecord } from '../transactions/transactions.types.js';
import type {
  CardPatch,
  CardRecord,
  InvoiceInstallmentItem,
  InvoicePaymentItem,
  InvoiceRecord,
  NewCard,
  NewPayment,
  NewPurchase,
  PurchasePatch,
  PurchaseRecord,
} from './credit-cards.types.js';
import { invoiceColumnsSql, invoiceFiguresSql, type InvoiceFiguresRow } from './invoice-sql.js';

/** Toda consulta filtra por `userId`: cartão, fatura ou compra de outro usuário nunca é encontrado. */
export interface CreditCardsRepository {
  listCards(userId: string, options: { includeArchived: boolean }): Promise<CardRecord[]>;
  findCard(userId: string, id: string): Promise<CardRecord | undefined>;
  createCard(userId: string, input: NewCard): Promise<CardRecord>;
  updateCard(userId: string, id: string, patch: CardPatch): Promise<CardRecord | undefined>;
  setCardArchived(userId: string, id: string, archived: boolean): Promise<CardRecord | undefined>;
  /** Limite comprometido por cartão: Σ parcelas (não canceladas) − Σ pagamentos efetivados (piso 0). */
  usedLimits(userId: string): Promise<Map<string, number>>;
  /** Fatura ABERTA de cada cartão (a de fechamento mais próximo que ainda não passou). */
  openInvoices(userId: string, today: string): Promise<Map<string, InvoiceRecord>>;
  listInvoices(userId: string, cardId: string): Promise<InvoiceRecord[]>;
  /** Faturas de todos os cartões com valor a pagar (total − pago − agendado > 0), por vencimento. */
  payableInvoices(userId: string): Promise<(InvoiceRecord & { cardName: string })[]>;
  findInvoice(userId: string, invoiceId: string): Promise<InvoiceRecord | undefined>;
  invoiceInstallments(userId: string, invoiceId: string): Promise<InvoiceInstallmentItem[]>;
  invoicePayments(userId: string, invoiceId: string): Promise<InvoicePaymentItem[]>;
  createPurchase(userId: string, card: CardRecord, input: NewPurchase): Promise<PurchaseRecord>;
  listPurchases(userId: string, cardId: string, limit: number): Promise<PurchaseRecord[]>;
  findPurchase(userId: string, id: string): Promise<PurchaseRecord | undefined>;
  updatePurchase(
    userId: string,
    id: string,
    patch: PurchasePatch,
  ): Promise<PurchaseRecord | undefined>;
  cancelPurchase(userId: string, id: string): Promise<PurchaseRecord | undefined>;
  /**
   * Cria o pagamento com a fatura TRAVADA (SELECT … FOR UPDATE): `decide` recebe os valores atuais e
   * valida (lançando erro) antes do INSERT, então dois pagamentos simultâneos não passam do devido.
   */
  createPayment(
    userId: string,
    invoiceId: string,
    decide: (invoice: InvoiceRecord) => NewPayment,
  ): Promise<TransactionRecord | undefined>;
}

const num = (value: unknown): number => Number(value ?? 0);

const cardColumns = {
  id: creditCards.id,
  name: creditCards.name,
  limitCents: creditCards.limitCents,
  closingDay: creditCards.closingDay,
  dueDay: creditCards.dueDay,
  paymentAccountId: creditCards.paymentAccountId,
  archivedAt: creditCards.archivedAt,
  createdAt: creditCards.createdAt,
};

function toInvoice(row: InvoiceFiguresRow): InvoiceRecord {
  return {
    id: row.id,
    creditCardId: row.credit_card_id,
    referenceMonth: row.reference_month,
    closingDate: row.closing_date,
    dueDate: row.due_date,
    totalCents: num(row.total_cents),
    paidCents: num(row.paid_cents),
    scheduledCents: num(row.scheduled_cents),
  };
}

const NAME_TAKEN = 'Já existe um cartão ativo com esse nome.';

export class DrizzleCreditCardsRepository implements CreditCardsRepository {
  constructor(private readonly db: DrizzleDb) {}

  // ---------- Cartões ----------

  listCards(userId: string, { includeArchived }: { includeArchived: boolean }) {
    return this.db
      .select(cardColumns)
      .from(creditCards)
      .where(
        includeArchived
          ? eq(creditCards.userId, userId)
          : and(eq(creditCards.userId, userId), isNull(creditCards.archivedAt)),
      )
      .orderBy(asc(creditCards.archivedAt), asc(creditCards.createdAt), asc(creditCards.id));
  }

  async findCard(userId: string, id: string) {
    const [row] = await this.db
      .select(cardColumns)
      .from(creditCards)
      .where(and(eq(creditCards.userId, userId), eq(creditCards.id, id)))
      .limit(1);
    return row;
  }

  async createCard(userId: string, input: NewCard) {
    try {
      const [row] = await this.db
        .insert(creditCards)
        .values({ userId, ...input })
        .returning(cardColumns);
      if (!row) throw new Error('INSERT em credit_cards não retornou linha');
      return row;
    } catch (error) {
      if (isUniqueViolation(error, 'credit_cards_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }

  async updateCard(userId: string, id: string, patch: CardPatch) {
    try {
      const [row] = await this.db
        .update(creditCards)
        .set(patch)
        .where(and(eq(creditCards.userId, userId), eq(creditCards.id, id)))
        .returning(cardColumns);
      return row;
    } catch (error) {
      if (isUniqueViolation(error, 'credit_cards_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }

  async setCardArchived(userId: string, id: string, archived: boolean) {
    try {
      const [row] = await this.db
        .update(creditCards)
        .set({ archivedAt: archived ? new Date() : null })
        .where(and(eq(creditCards.userId, userId), eq(creditCards.id, id)))
        .returning(cardColumns);
      return row;
    } catch (error) {
      // Reativar um cartão cujo nome foi reutilizado por outro ativo.
      if (isUniqueViolation(error, 'credit_cards_user_name_active_unique')) {
        throw new ConflictError(NAME_TAKEN);
      }
      throw error;
    }
  }

  async usedLimits(userId: string) {
    const rows = await this.db.execute<{ card_id: string; used: string }>(sql`
      select c.id as card_id,
        (
          select coalesce(sum(ci.amount_cents), 0)
          from credit_card_installments ci
          join credit_card_transactions p on p.id = ci.card_transaction_id and p.user_id = ci.user_id
          where ci.credit_card_id = c.id and ci.user_id = c.user_id and p.cancelled_at is null
        ) - (
          select coalesce(sum(t.amount_cents), 0)
          from transactions t
          join credit_card_invoices i on i.id = t.credit_card_invoice_id and i.user_id = t.user_id
          where i.credit_card_id = c.id and t.user_id = c.user_id
            and t.type = 'card_payment' and t.status = 'completed'
        ) as used
      from credit_cards c
      where c.user_id = ${userId}`);
    return new Map(rows.map((row) => [row.card_id, Math.max(0, num(row.used))]));
  }

  async openInvoices(userId: string, today: string) {
    const rows = await this.db.execute<InvoiceFiguresRow>(sql`
      select distinct on (i.credit_card_id) ${invoiceColumnsSql}, ${invoiceFiguresSql}
      from credit_card_invoices i
      where i.user_id = ${userId} and i.closing_date >= ${today}::date
      order by i.credit_card_id, i.closing_date asc`);
    return new Map(rows.map((row) => [row.credit_card_id, toInvoice(row)]));
  }

  // ---------- Faturas ----------

  private async invoices(where: SQL, order: SQL) {
    const rows = await this.db.execute<InvoiceFiguresRow>(sql`
      select ${invoiceColumnsSql}, ${invoiceFiguresSql}
      from credit_card_invoices i
      where ${where}
      order by ${order}`);
    return rows.map(toInvoice);
  }

  listInvoices(userId: string, cardId: string) {
    return this.invoices(
      sql`i.user_id = ${userId} and i.credit_card_id = ${cardId}`,
      sql`i.reference_month desc`,
    );
  }

  async payableInvoices(userId: string) {
    const rows = await this.db.execute<InvoiceFiguresRow & { card_name: string }>(sql`
      select * from (
        select ${invoiceColumnsSql}, c.name as card_name, ${invoiceFiguresSql}
        from credit_card_invoices i
        join credit_cards c on c.id = i.credit_card_id and c.user_id = i.user_id
        where i.user_id = ${userId}
      ) x
      where x.total_cents - x.paid_cents - x.scheduled_cents > 0
      order by x.due_date asc, x.id asc`);
    return rows.map((row) => ({ ...toInvoice(row), cardName: row.card_name }));
  }

  async findInvoice(userId: string, invoiceId: string) {
    const [invoice] = await this.invoices(
      sql`i.user_id = ${userId} and i.id = ${invoiceId}`,
      sql`i.id`,
    );
    return invoice;
  }

  async invoiceInstallments(userId: string, invoiceId: string) {
    const rows = await this.db
      .select({
        purchaseId: creditCardTransactions.id,
        description: creditCardTransactions.description,
        purchaseDate: creditCardTransactions.purchaseDate,
        categoryId: creditCardTransactions.categoryId,
        installmentNumber: creditCardInstallments.installmentNumber,
        installmentsCount: creditCardTransactions.installmentsCount,
        amountCents: creditCardInstallments.amountCents,
      })
      .from(creditCardInstallments)
      .innerJoin(
        creditCardTransactions,
        and(
          eq(creditCardTransactions.id, creditCardInstallments.cardTransactionId),
          eq(creditCardTransactions.userId, creditCardInstallments.userId),
        ),
      )
      .where(
        and(
          eq(creditCardInstallments.userId, userId),
          eq(creditCardInstallments.invoiceId, invoiceId),
          isNull(creditCardTransactions.cancelledAt),
        ),
      )
      .orderBy(
        asc(creditCardTransactions.purchaseDate),
        asc(creditCardTransactions.createdAt),
        asc(creditCardInstallments.installmentNumber),
      );
    return rows;
  }

  async invoicePayments(userId: string, invoiceId: string) {
    const rows = await this.db
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        amountCents: transactions.amountCents,
        date: transactions.transactionDate,
        status: transactions.status,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.creditCardInvoiceId, invoiceId),
          eq(transactions.type, 'card_payment'),
        ),
      )
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));
    return rows;
  }

  // ---------- Compras ----------

  async createPurchase(userId: string, card: CardRecord, input: NewPurchase) {
    const purchaseId = await this.db.transaction(async (tx) => {
      // Uma fatura por (cartão, mês do vencimento): cria se não existir. `ON CONFLICT DO NOTHING`
      // torna compras simultâneas seguras (a segunda apenas reutiliza a fatura da primeira).
      const invoiceIds = new Map<string, string>();
      for (const { period } of input.installments) {
        if (invoiceIds.has(period.referenceMonth)) continue;
        await tx
          .insert(creditCardInvoices)
          .values({
            userId,
            creditCardId: card.id,
            referenceMonth: period.referenceMonth,
            closingDate: period.closingDate,
            dueDate: period.dueDate,
          })
          .onConflictDoNothing({
            target: [creditCardInvoices.creditCardId, creditCardInvoices.referenceMonth],
          });
        const [invoice] = await tx
          .select({ id: creditCardInvoices.id })
          .from(creditCardInvoices)
          .where(
            and(
              eq(creditCardInvoices.userId, userId),
              eq(creditCardInvoices.creditCardId, card.id),
              eq(creditCardInvoices.referenceMonth, period.referenceMonth),
            ),
          );
        if (!invoice) throw new Error('Fatura não encontrada após criação');
        invoiceIds.set(period.referenceMonth, invoice.id);
      }

      const [purchase] = await tx
        .insert(creditCardTransactions)
        .values({
          userId,
          creditCardId: card.id,
          categoryId: input.categoryId,
          description: input.description,
          purchaseDate: input.purchaseDate,
          totalAmountCents: input.totalAmountCents,
          installmentsCount: input.installments.length,
        })
        .returning({ id: creditCardTransactions.id });
      if (!purchase) throw new Error('INSERT em credit_card_transactions não retornou linha');

      await tx.insert(creditCardInstallments).values(
        input.installments.map((installment, index) => ({
          userId,
          creditCardId: card.id,
          cardTransactionId: purchase.id,
          invoiceId: invoiceIds.get(installment.period.referenceMonth) as string,
          installmentNumber: index + 1,
          amountCents: installment.amountCents,
        })),
      );
      return purchase.id;
    });

    const record = await this.findPurchase(userId, purchaseId);
    if (!record) throw new Error('Compra recém-criada não encontrada');
    return record;
  }

  private async purchases(where: SQL | undefined, limit?: number) {
    const query = this.db
      .select({
        id: creditCardTransactions.id,
        creditCardId: creditCardTransactions.creditCardId,
        description: creditCardTransactions.description,
        purchaseDate: creditCardTransactions.purchaseDate,
        totalAmountCents: creditCardTransactions.totalAmountCents,
        installmentsCount: creditCardTransactions.installmentsCount,
        categoryId: creditCardTransactions.categoryId,
        cancelledAt: creditCardTransactions.cancelledAt,
        createdAt: creditCardTransactions.createdAt,
      })
      .from(creditCardTransactions)
      .where(where)
      .orderBy(
        desc(creditCardTransactions.purchaseDate),
        desc(creditCardTransactions.createdAt),
        desc(creditCardTransactions.id),
      );
    const rows = await (limit ? query.limit(limit) : query);
    if (rows.length === 0) return [];

    const installments = await this.db
      .select({
        cardTransactionId: creditCardInstallments.cardTransactionId,
        installmentNumber: creditCardInstallments.installmentNumber,
        amountCents: creditCardInstallments.amountCents,
        invoiceId: creditCardInstallments.invoiceId,
        referenceMonth: sql<string>`${creditCardInvoices.referenceMonth}::text`,
        dueDate: sql<string>`${creditCardInvoices.dueDate}::text`,
      })
      .from(creditCardInstallments)
      .innerJoin(
        creditCardInvoices,
        and(
          eq(creditCardInvoices.id, creditCardInstallments.invoiceId),
          eq(creditCardInvoices.userId, creditCardInstallments.userId),
        ),
      )
      .where(
        inArray(
          creditCardInstallments.cardTransactionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(creditCardInstallments.installmentNumber));

    return rows.map((row): PurchaseRecord => ({
      ...row,
      installments: installments
        .filter((item) => item.cardTransactionId === row.id)
        .map(({ cardTransactionId: _ignored, ...item }) => item),
    }));
  }

  listPurchases(userId: string, cardId: string, limit: number) {
    return this.purchases(
      and(
        eq(creditCardTransactions.userId, userId),
        eq(creditCardTransactions.creditCardId, cardId),
      ),
      limit,
    );
  }

  async findPurchase(userId: string, id: string) {
    const [purchase] = await this.purchases(
      and(eq(creditCardTransactions.userId, userId), eq(creditCardTransactions.id, id)),
    );
    return purchase;
  }

  async updatePurchase(userId: string, id: string, patch: PurchasePatch) {
    const [row] = await this.db
      .update(creditCardTransactions)
      .set(patch)
      .where(and(eq(creditCardTransactions.userId, userId), eq(creditCardTransactions.id, id)))
      .returning({ id: creditCardTransactions.id });
    return row ? this.findPurchase(userId, id) : undefined;
  }

  async cancelPurchase(userId: string, id: string) {
    const [row] = await this.db
      .update(creditCardTransactions)
      .set({ cancelledAt: new Date() })
      .where(
        and(
          eq(creditCardTransactions.userId, userId),
          eq(creditCardTransactions.id, id),
          isNull(creditCardTransactions.cancelledAt),
        ),
      )
      .returning({ id: creditCardTransactions.id });
    // Já cancelada (ou inexistente): devolve o estado atual — cancelar é idempotente.
    void row;
    return this.findPurchase(userId, id);
  }

  // ---------- Pagamento ----------

  async createPayment(
    userId: string,
    invoiceId: string,
    decide: (invoice: InvoiceRecord) => NewPayment,
  ) {
    return this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: creditCardInvoices.id })
        .from(creditCardInvoices)
        .where(and(eq(creditCardInvoices.userId, userId), eq(creditCardInvoices.id, invoiceId)))
        .for('update');
      if (!locked) return undefined;

      // Valores lidos DEPOIS da trava: outro pagamento em andamento já foi confirmado ou aguarda.
      const rows = await tx.execute<InvoiceFiguresRow>(sql`
        select ${invoiceColumnsSql}, ${invoiceFiguresSql}
        from credit_card_invoices i
        where i.user_id = ${userId} and i.id = ${invoiceId}`);
      const [row] = rows;
      if (!row) return undefined;
      const invoice = toInvoice(row);

      const payment = decide(invoice);
      // O repositório de lançamentos reutiliza a mesma transação (tx implementa a mesma interface).
      return new DrizzleTransactionsRepository(tx).create(userId, {
        accountId: payment.accountId,
        categoryId: null,
        type: 'card_payment',
        amountCents: payment.amountCents,
        description: payment.description,
        transactionDate: payment.transactionDate,
        paymentMethod: null,
        status: payment.status,
        creditCardInvoiceId: invoiceId,
      });
    });
  }
}
