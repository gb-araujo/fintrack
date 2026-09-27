import type { DrizzleDb } from './db/client.js';
import { DrizzleAccountsRepository } from './modules/accounts/accounts.repository.js';
import { AccountsService } from './modules/accounts/accounts.service.js';
import { DrizzleBudgetsRepository } from './modules/budgets/budgets.repository.js';
import { BudgetsService } from './modules/budgets/budgets.service.js';
import { DrizzleDashboardRepository } from './modules/dashboard/dashboard.repository.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { DrizzleCategoriesRepository } from './modules/categories/categories.repository.js';
import { CategoriesService } from './modules/categories/categories.service.js';
import { DrizzleRecurringRepository } from './modules/recurring/recurring.repository.js';
import { RecurringService } from './modules/recurring/recurring.service.js';
import { DrizzleTransactionsRepository } from './modules/transactions/transactions.repository.js';
import { TransactionsService } from './modules/transactions/transactions.service.js';
import { DrizzleTransfersRepository } from './modules/transfers/transfers.repository.js';
import { TransfersService } from './modules/transfers/transfers.service.js';
import { DrizzleUsersRepository } from './modules/users/users.repository.js';
import { UsersService } from './modules/users/users.service.js';

/**
 * Composição das camadas: repositórios (Drizzle) → services. Usada pelo servidor (app.ts) e por
 * scripts como o seed, para que todos passem pelas MESMAS regras de negócio.
 */
export function buildDomain(db: DrizzleDb, options: { now?: () => Date } = {}) {
  const usersRepository = new DrizzleUsersRepository(db);
  const accountsRepository = new DrizzleAccountsRepository(db);
  const categoriesRepository = new DrizzleCategoriesRepository(db);
  const transactionsRepository = new DrizzleTransactionsRepository(db);
  const transfersRepository = new DrizzleTransfersRepository(db);
  const dashboardRepository = new DrizzleDashboardRepository(db);
  const budgetsRepository = new DrizzleBudgetsRepository(db);
  const recurringRepository = new DrizzleRecurringRepository(db);
  const now = options.now ? { now: options.now } : {};

  const recurringService = new RecurringService({
    recurring: recurringRepository,
    transactions: transactionsRepository,
    accounts: accountsRepository,
    categories: categoriesRepository,
    users: usersRepository,
    ...now,
  });

  return {
    usersRepository,
    usersService: new UsersService(usersRepository),
    accountsService: new AccountsService(accountsRepository),
    categoriesService: new CategoriesService(categoriesRepository),
    transactionsService: new TransactionsService({
      transactions: transactionsRepository,
      accounts: accountsRepository,
      categories: categoriesRepository,
      users: usersRepository,
      ...now,
    }),
    recurringService,
    budgetsService: new BudgetsService({
      budgets: budgetsRepository,
      categories: categoriesRepository,
      users: usersRepository,
      recurring: recurringService,
      ...now,
    }),
    dashboardService: new DashboardService({
      dashboard: dashboardRepository,
      accounts: accountsRepository,
      users: usersRepository,
      recurring: recurringService,
      ...now,
    }),
    transfersService: new TransfersService({
      transfers: transfersRepository,
      accounts: accountsRepository,
      users: usersRepository,
      ...now,
    }),
  };
}

export type Domain = ReturnType<typeof buildDomain>;
