import {
  formatBRL,
  isFutureDate,
  todayInTimeZone,
  type CreateCreditCardRequest,
  type CreatePurchaseRequest,
  type InvoiceStatus,
  type PayInvoiceRequest,
  type UpdateCreditCardRequest,
  type UpdatePurchaseRequest,
} from '@fintrack/shared';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import {
  assertCategoryFits,
  resolveInitialStatus,
} from '../transactions/domain/transaction-rules.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { CreditCardsRepository } from './credit-cards.repository.js';
import type {
  CardPatch,
  CardRecord,
  InvoiceInstallmentItem,
  InvoicePaymentItem,
  InvoiceRecord,
  PurchasePatch,
  PurchaseRecord,
} from './credit-cards.types.js';
import { splitInstallments } from './domain/installments.js';
import { installmentPeriods } from './domain/invoice-period.js';
import { invoiceState, payableCents } from './domain/invoice-status.js';

export interface CreditCardsServiceDeps {
  cards: CreditCardsRepository;
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  users: UsersRepository;
  now?: () => Date;
}

/** Fatura com o status derivado de datas e valores. */
export interface InvoiceView extends InvoiceRecord {
  status: InvoiceStatus;
  overdue: boolean;
  remainingCents: number;
}

export interface CardView extends CardRecord {
  usedLimitCents: number;
  availableLimitCents: number;
  openInvoice: InvoiceView | null;
}

export class CreditCardsService {
  private readonly now: () => Date;

  constructor(private readonly deps: CreditCardsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  private view(invoice: InvoiceRecord, today: string): InvoiceView {
    return { ...invoice, ...invoiceState(invoice, today) };
  }

  // ---------- Cartões ----------

  async list(userId: string, includeArchived: boolean): Promise<CardView[]> {
    const today = await this.today(userId);
    const [cards, used, open] = await Promise.all([
      this.deps.cards.listCards(userId, { includeArchived }),
      this.deps.cards.usedLimits(userId),
      this.deps.cards.openInvoices(userId, today),
    ]);
    return cards.map((card) => this.cardView(card, used, open, today));
  }

  async get(userId: string, id: string): Promise<CardView> {
    const card = await this.requireCard(userId, id);
    const today = await this.today(userId);
    const [used, open] = await Promise.all([
      this.deps.cards.usedLimits(userId),
      this.deps.cards.openInvoices(userId, today),
    ]);
    return this.cardView(card, used, open, today);
  }

  private cardView(
    card: CardRecord,
    used: Map<string, number>,
    open: Map<string, InvoiceRecord>,
    today: string,
  ): CardView {
    const usedLimitCents = used.get(card.id) ?? 0;
    const openInvoice = open.get(card.id);
    return {
      ...card,
      usedLimitCents,
      availableLimitCents: card.limitCents - usedLimitCents,
      openInvoice: openInvoice ? this.view(openInvoice, today) : null,
    };
  }

  async create(userId: string, input: CreateCreditCardRequest): Promise<CardRecord> {
    if (input.paymentAccountId) await this.requirePaymentAccount(userId, input.paymentAccountId);
    return this.deps.cards.createCard(userId, {
      name: input.name,
      limitCents: input.limitCents,
      closingDay: input.closingDay,
      dueDay: input.dueDay,
      paymentAccountId: input.paymentAccountId ?? null,
    });
  }

  async update(userId: string, id: string, input: UpdateCreditCardRequest): Promise<CardRecord> {
    await this.requireCard(userId, id);
    if (input.paymentAccountId) await this.requirePaymentAccount(userId, input.paymentAccountId);
    const patch: CardPatch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.limitCents !== undefined ? { limitCents: input.limitCents } : {}),
      ...(input.closingDay !== undefined ? { closingDay: input.closingDay } : {}),
      ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
      ...(input.paymentAccountId !== undefined ? { paymentAccountId: input.paymentAccountId } : {}),
    };
    return this.require(
      await this.deps.cards.updateCard(userId, id, patch),
      'Cartão não encontrado.',
    );
  }

  /** Cartões são arquivados, nunca apagados; faturas em aberto continuam contando no disponível. */
  async setArchived(userId: string, id: string, archived: boolean): Promise<CardRecord> {
    await this.requireCard(userId, id);
    return this.require(
      await this.deps.cards.setCardArchived(userId, id, archived),
      'Cartão não encontrado.',
    );
  }

  // ---------- Compras ----------

  async createPurchase(
    userId: string,
    cardId: string,
    input: CreatePurchaseRequest,
  ): Promise<PurchaseRecord> {
    const card = await this.requireCard(userId, cardId);
    if (card.archivedAt) {
      throw new ConflictError('O cartão está arquivado. Reative-o para lançar compras.');
    }
    const today = await this.today(userId);
    // Como nos lançamentos: nada é registrado antes de acontecer.
    if (isFutureDate(input.purchaseDate, today)) {
      throw new BusinessRuleError('A data da compra não pode ser futura.');
    }
    if (input.categoryId) await this.requireExpenseCategory(userId, input.categoryId);

    const count = input.installmentsCount ?? 1;
    if (input.totalAmountCents < count) {
      throw new BusinessRuleError('O valor é pequeno demais para essa quantidade de parcelas.');
    }
    const amounts = splitInstallments(input.totalAmountCents, count);
    const periods = installmentPeriods(card, input.purchaseDate, count);

    return this.deps.cards.createPurchase(userId, card, {
      description: input.description,
      purchaseDate: input.purchaseDate,
      totalAmountCents: input.totalAmountCents,
      categoryId: input.categoryId ?? null,
      installments: amounts.map((amountCents, index) => ({
        amountCents,
        period: periods[index] as (typeof periods)[number],
      })),
    });
  }

  async listPurchases(userId: string, cardId: string): Promise<PurchaseRecord[]> {
    await this.requireCard(userId, cardId);
    return this.deps.cards.listPurchases(userId, cardId, PURCHASES_LIMIT);
  }

  async getPurchase(userId: string, id: string): Promise<PurchaseRecord> {
    return this.require(await this.deps.cards.findPurchase(userId, id), 'Compra não encontrada.');
  }

  /** Só descrição e categoria: valor, data e parcelas mexeriam em faturas (cancele e lance de novo). */
  async updatePurchase(
    userId: string,
    id: string,
    input: UpdatePurchaseRequest,
  ): Promise<PurchaseRecord> {
    const current = await this.getPurchase(userId, id);
    if (current.cancelledAt) throw new ConflictError('Compra cancelada não pode ser alterada.');
    if (input.categoryId) await this.requireExpenseCategory(userId, input.categoryId);
    const patch: PurchasePatch = {
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
    };
    return this.require(
      await this.deps.cards.updatePurchase(userId, id, patch),
      'Compra não encontrada.',
    );
  }

  /** Cancela (estorno): as parcelas saem de fatura, limite e orçamento. Idempotente. */
  async cancelPurchase(userId: string, id: string): Promise<PurchaseRecord> {
    await this.getPurchase(userId, id);
    return this.require(await this.deps.cards.cancelPurchase(userId, id), 'Compra não encontrada.');
  }

  // ---------- Faturas ----------

  async listInvoices(userId: string, cardId: string): Promise<InvoiceView[]> {
    await this.requireCard(userId, cardId);
    const today = await this.today(userId);
    const invoices = await this.deps.cards.listInvoices(userId, cardId);
    return invoices.map((invoice) => this.view(invoice, today));
  }

  /** Faturas com valor a pagar, de todos os cartões (para vincular um pagamento importado). */
  async listPayableInvoices(userId: string): Promise<(InvoiceView & { cardName: string })[]> {
    const today = await this.today(userId);
    const invoices = await this.deps.cards.payableInvoices(userId);
    return invoices.map((invoice) => ({
      ...this.view(invoice, today),
      cardName: invoice.cardName,
    }));
  }

  async getInvoice(
    userId: string,
    invoiceId: string,
  ): Promise<{
    invoice: InvoiceView;
    cardName: string;
    installments: InvoiceInstallmentItem[];
    payments: InvoicePaymentItem[];
  }> {
    const record = this.require(
      await this.deps.cards.findInvoice(userId, invoiceId),
      'Fatura não encontrada.',
    );
    const [card, installments, payments, today] = await Promise.all([
      this.requireCard(userId, record.creditCardId),
      this.deps.cards.invoiceInstallments(userId, invoiceId),
      this.deps.cards.invoicePayments(userId, invoiceId),
      this.today(userId),
    ]);
    return { invoice: this.view(record, today), cardName: card.name, installments, payments };
  }

  /**
   * Paga (ou agenda) a fatura a partir de uma conta: cria um `card_payment` — sai do saldo da conta,
   * NÃO é despesa (as parcelas já foram contadas). Sem valor, paga tudo que resta sem agendamento.
   * A regra "não pagar mais que o devido" é verificada com a fatura travada.
   */
  async payInvoice(userId: string, invoiceId: string, input: PayInvoiceRequest) {
    const record = this.require(
      await this.deps.cards.findInvoice(userId, invoiceId),
      'Fatura não encontrada.',
    );
    const card = await this.requireCard(userId, record.creditCardId);
    const account = await this.deps.accounts.findById(userId, input.accountId);
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (account.archivedAt) {
      throw new ConflictError('A conta está arquivada. Escolha outra ou reative-a.');
    }
    if (account.type === 'investment') {
      throw new BusinessRuleError(
        'A fatura deve ser paga a partir de uma conta bancária ou carteira.',
      );
    }

    const today = await this.today(userId);
    const date = input.paymentDate ?? today;
    const status = resolveInitialStatus(undefined, date, today);
    const month = `${record.referenceMonth.slice(5, 7)}/${record.referenceMonth.slice(0, 4)}`;

    const created = await this.deps.cards.createPayment(userId, invoiceId, (invoice) => {
      const payable = payableCents(invoice);
      const amountCents = input.amountCents ?? payable;
      if (amountCents <= 0) {
        throw new BusinessRuleError('Esta fatura não tem valor em aberto para pagar.');
      }
      if (amountCents > payable) {
        throw new BusinessRuleError(
          `O valor passa do que resta pagar da fatura (${formatBRL(payable)}).`,
        );
      }
      return {
        accountId: input.accountId,
        amountCents,
        description: `Fatura ${card.name} ${month}`,
        transactionDate: date,
        status,
      };
    });
    return this.require(created, 'Fatura não encontrada.');
  }

  // ---------- Auxiliares ----------

  private async requireCard(userId: string, id: string): Promise<CardRecord> {
    return this.require(await this.deps.cards.findCard(userId, id), 'Cartão não encontrado.');
  }

  private async requirePaymentAccount(userId: string, accountId: string) {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (account.type === 'investment') {
      throw new BusinessRuleError('A conta de pagamento deve ser um banco ou carteira.');
    }
    if (account.archivedAt) throw new ConflictError('A conta está arquivada.');
  }

  private async requireExpenseCategory(userId: string, categoryId: string) {
    const category = await this.deps.categories.findById(userId, categoryId);
    if (!category) throw new NotFoundError('Categoria não encontrada.');
    assertCategoryFits(category, 'expense');
  }

  private require<T>(value: T | undefined, message: string): T {
    if (value === undefined) throw new NotFoundError(message);
    return value;
  }
}

/** Compras listadas por cartão (as mais recentes). */
export const PURCHASES_LIMIT = 200;
