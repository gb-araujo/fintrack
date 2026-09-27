import {
  addDaysToDate,
  endOfMonth,
  startOfMonth,
  todayInTimeZone,
  type AvailableComponents,
  type Dashboard,
  type PendingBill,
} from '@fintrack/shared';
import { NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import { RECURRING_LOOKBACK_DAYS, type RecurringService } from '../recurring/recurring.service.js';
import type { ForecastOccurrence } from '../recurring/recurring.types.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { DashboardRepository, OutstandingInvoice } from './dashboard.repository.js';
import { availableAmount, isLiquidForAvailable, resolveHorizon } from './domain/available.js';

const NEXT_BILLS = 5;
/** Compromissos futuros: despesas previstas por recorrências nos N dias seguintes ao horizonte. */
export const FUTURE_WINDOW_DAYS = 60;

export interface DashboardServiceDeps {
  dashboard: DashboardRepository;
  accounts: AccountsRepository;
  users: UsersRepository;
  recurring: RecurringService;
  now?: () => Date;
}

const sumBy = (items: ForecastOccurrence[], predicate: (item: ForecastOccurrence) => boolean) =>
  items.filter(predicate).reduce((total, item) => total + item.amountCents, 0);

function toBill(item: ForecastOccurrence): PendingBill {
  return {
    id: `recurring:${item.recurringId}:${item.date}`,
    kind: 'recurring',
    recurringId: item.recurringId,
    invoiceId: null,
    description: item.name,
    amountCents: item.amountCents,
    estimated: item.estimated,
    date: item.date,
    accountId: item.accountId,
    categoryId: item.categoryId,
    overdue: item.overdue,
  };
}

function invoiceBill(invoice: OutstandingInvoice, today: string): PendingBill {
  const month = `${invoice.referenceMonth.slice(5, 7)}/${invoice.referenceMonth.slice(0, 4)}`;
  return {
    id: `invoice:${invoice.id}`,
    kind: 'invoice',
    recurringId: null,
    invoiceId: invoice.id,
    description: `Fatura ${invoice.cardName} ${month}`,
    amountCents: invoice.remainingCents,
    estimated: false,
    date: invoice.dueDate,
    accountId: invoice.paymentAccountId,
    categoryId: null,
    overdue: invoice.dueDate < today,
  };
}

/** Monta o painel. O backend é a fonte da verdade: os clientes só exibem estes números. */
export class DashboardService {
  private readonly now: () => Date;

  constructor(private readonly deps: DashboardServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async get(userId: string, requestedUntil?: string): Promise<Dashboard> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');

    const today = todayInTimeZone(user.timezone, this.now());
    const until = resolveHorizon(today, requestedUntil);
    const monthFrom = startOfMonth(today);
    const monthTo = endOfMonth(today);

    // Recorrências com confirmação automática viram lançamentos ANTES de calcular saldos e previsões.
    await this.deps.recurring.materializeAutoConfirmed(userId);

    const forecastFrom = addDaysToDate(today, -RECURRING_LOOKBACK_DAYS);
    const [
      accounts,
      liquidPending,
      crossings,
      month,
      bills,
      future,
      forecast,
      futureForecast,
      invoices,
      cardExpense,
    ] = await Promise.all([
      this.deps.accounts.list(userId, { includeArchived: false }),
      this.deps.dashboard.liquidPending(userId, until),
      this.deps.dashboard.pendingTransferCrossings(userId, until),
      this.deps.dashboard.completedTotals(userId, monthFrom, monthTo),
      this.deps.dashboard.pendingBills(userId, until, today, NEXT_BILLS),
      this.deps.dashboard.futureCommitments(userId, until),
      this.deps.recurring.forecast(userId, forecastFrom, until, today),
      this.deps.recurring.forecast(
        userId,
        addDaysToDate(until, 1),
        addDaysToDate(until, FUTURE_WINDOW_DAYS),
        today,
      ),
      this.deps.dashboard.outstandingInvoices(userId),
      this.deps.dashboard.cardExpenses(userId, monthFrom),
    ]);

    const dueInvoices = invoices.filter((invoice) => invoice.dueDate <= until);
    const laterInvoices = invoices.filter((invoice) => invoice.dueDate > until);
    const sum = (items: { balanceCents: number }[]) =>
      items.reduce((total, account) => total + account.balanceCents, 0);
    const cash = accounts.filter((account) => account.type !== 'investment');
    const investments = accounts.filter((account) => account.type === 'investment');

    // Previsões que entram no "disponível": recorrências marcadas e em contas líquidas.
    const counted = (item: ForecastOccurrence) => item.includeInForecast && item.accountLiquid;
    const components: AvailableComponents = {
      liquidBalanceCents: sum(accounts.filter(isLiquidForAvailable)),
      pendingIncomeCents: liquidPending.incomeCents,
      pendingExpensesCents: liquidPending.expenseCents,
      pendingTransfersInCents: crossings.inCents,
      pendingTransfersOutCents: crossings.outCents,
      forecastIncomeCents: sumBy(forecast, (item) => counted(item) && item.type === 'income'),
      forecastExpensesCents: sumBy(forecast, (item) => counted(item) && item.type === 'expense'),
      // Faturas de cartão com vencimento até o horizonte (inclui vencidas): o que resta pagar.
      invoicesCents: dueInvoices.reduce((total, invoice) => total + invoice.remainingCents, 0),
    };

    // "Contas pendentes": lançamentos pendentes + despesas previstas por recorrências (contas ativas).
    const forecastBills = forecast.filter((item) => item.type === 'expense' && item.accountUsable);
    const invoiceBills = dueInvoices.map((invoice) => invoiceBill(invoice, today));
    const extraBills = [...forecastBills.map(toBill), ...invoiceBills];
    const pendingBills = {
      count: bills.count + extraBills.length,
      totalCents:
        bills.totalCents + extraBills.reduce((total, bill) => total + bill.amountCents, 0),
      overdueCount: bills.overdueCount + extraBills.filter((bill) => bill.overdue).length,
      overdueCents:
        bills.overdueCents +
        extraBills
          .filter((bill) => bill.overdue)
          .reduce((total, bill) => total + bill.amountCents, 0),
      next: [...bills.next, ...extraBills]
        .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
        .slice(0, NEXT_BILLS),
    };

    const futureBills = futureForecast.filter(
      (item) => item.type === 'expense' && item.accountUsable,
    );
    // Parcelas/faturas futuras (depois do horizonte) são compromissos: todas, não só uma janela.
    const futureCommitments = {
      count: future.count + futureBills.length + laterInvoices.length,
      totalCents:
        future.totalCents +
        futureBills.reduce((total, item) => total + item.amountCents, 0) +
        laterInvoices.reduce((total, invoice) => total + invoice.remainingCents, 0),
    };
    const cardLiabilitiesCents = invoices.reduce(
      (total, invoice) => total + invoice.remainingCents,
      0,
    );

    return {
      today,
      until,
      availableToSpend: { amountCents: availableAmount(components), components },
      totalBalanceCents: sum(cash),
      investmentsCents: sum(investments),
      // Patrimônio: saldos − o que ainda se deve nos cartões (compra no cartão é passivo).
      netWorthCents: sum(accounts) - cardLiabilitiesCents,
      cardLiabilitiesCents,
      month: {
        from: monthFrom,
        to: monthTo,
        incomeCents: month.incomeCents,
        // Despesa do cartão é reconhecida por parcela, no mês do vencimento da fatura (ADR 0005).
        expenseCents: month.expenseCents + cardExpense,
        cardExpenseCents: cardExpense,
      },
      pendingBills,
      futureCommitments,
    };
  }
}
