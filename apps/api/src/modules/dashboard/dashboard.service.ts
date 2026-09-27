import {
  endOfMonth,
  startOfMonth,
  todayInTimeZone,
  type AvailableComponents,
  type Dashboard,
} from '@fintrack/shared';
import { NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { DashboardRepository } from './dashboard.repository.js';
import { availableAmount, isLiquidForAvailable, resolveHorizon } from './domain/available.js';

const NEXT_BILLS = 5;

export interface DashboardServiceDeps {
  dashboard: DashboardRepository;
  accounts: AccountsRepository;
  users: UsersRepository;
  now?: () => Date;
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

    const [accounts, liquidPending, crossings, month, bills, future] = await Promise.all([
      this.deps.accounts.list(userId, { includeArchived: false }),
      this.deps.dashboard.liquidPending(userId, until),
      this.deps.dashboard.pendingTransferCrossings(userId, until),
      this.deps.dashboard.completedTotals(userId, monthFrom, monthTo),
      this.deps.dashboard.pendingBills(userId, until, today, NEXT_BILLS),
      this.deps.dashboard.futureCommitments(userId, until),
    ]);

    const sum = (items: { balanceCents: number }[]) =>
      items.reduce((total, account) => total + account.balanceCents, 0);
    const cash = accounts.filter((account) => account.type !== 'investment');
    const investments = accounts.filter((account) => account.type === 'investment');

    const components: AvailableComponents = {
      liquidBalanceCents: sum(accounts.filter(isLiquidForAvailable)),
      pendingIncomeCents: liquidPending.incomeCents,
      pendingExpensesCents: liquidPending.expenseCents,
      pendingTransfersInCents: crossings.inCents,
      pendingTransfersOutCents: crossings.outCents,
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
      pendingBills: bills,
      futureCommitments: future,
    };
  }
}
