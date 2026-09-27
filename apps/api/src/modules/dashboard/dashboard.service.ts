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
import type { DashboardRepository } from './dashboard.repository.js';
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
    description: item.name,
    amountCents: item.amountCents,
    estimated: item.estimated,
    date: item.date,
    accountId: item.accountId,
    categoryId: item.categoryId,
    overdue: item.overdue,
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
    const [accounts, liquidPending, crossings, month, bills, future, forecast, futureForecast] =
      await Promise.all([
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
      ]);

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
    };

    // "Contas pendentes": lançamentos pendentes + despesas previstas por recorrências (contas ativas).
    const forecastBills = forecast.filter((item) => item.type === 'expense' && item.accountUsable);
    const pendingBills = {
      count: bills.count + forecastBills.length,
      totalCents:
        bills.totalCents + forecastBills.reduce((total, item) => total + item.amountCents, 0),
      overdueCount: bills.overdueCount + forecastBills.filter((item) => item.overdue).length,
      overdueCents:
        bills.overdueCents +
        forecastBills
          .filter((item) => item.overdue)
          .reduce((total, item) => total + item.amountCents, 0),
      next: [...bills.next, ...forecastBills.map(toBill)]
        .sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description))
        .slice(0, NEXT_BILLS),
    };

    const futureBills = futureForecast.filter(
      (item) => item.type === 'expense' && item.accountUsable,
    );
    const futureCommitments = {
      count: future.count + futureBills.length,
      totalCents:
        future.totalCents + futureBills.reduce((total, item) => total + item.amountCents, 0),
    };

    return {
      today,
      until,
      availableToSpend: { amountCents: availableAmount(components), components },
      totalBalanceCents: sum(cash),
      investmentsCents: sum(investments),
      netWorthCents: sum(accounts),
      month: {
        from: monthFrom,
        to: monthTo,
        incomeCents: month.incomeCents,
        expenseCents: month.expenseCents,
      },
      pendingBills,
      futureCommitments,
    };
  }
}
