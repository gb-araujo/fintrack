import type { DrizzleDb } from './db/client.js';
import { DrizzleAccountsRepository } from './modules/accounts/accounts.repository.js';
import { AccountsService } from './modules/accounts/accounts.service.js';
import { DrizzleBudgetsRepository } from './modules/budgets/budgets.repository.js';
import { BudgetsService } from './modules/budgets/budgets.service.js';
import { DrizzleCreditCardsRepository } from './modules/credit-cards/credit-cards.repository.js';
import { CreditCardsService } from './modules/credit-cards/credit-cards.service.js';
import { DrizzleDashboardRepository } from './modules/dashboard/dashboard.repository.js';
import { DashboardService } from './modules/dashboard/dashboard.service.js';
import { DrizzleCategoriesRepository } from './modules/categories/categories.repository.js';
import { CategoriesService } from './modules/categories/categories.service.js';
import {
  DrizzleImportsRepository,
  DrizzleMerchantRulesRepository,
} from './modules/imports/imports.repository.js';
import { ImportsService, type ImportsUnit } from './modules/imports/imports.service.js';
import { MerchantRulesService } from './modules/imports/merchant-rules.service.js';
import { ReportsRepository } from './modules/reports/reports.repository.js';
import { ReportsService } from './modules/reports/reports.service.js';
import { DrizzleRecurringRepository } from './modules/recurring/recurring.repository.js';
import { RecurringService } from './modules/recurring/recurring.service.js';
import { DrizzleTransactionsRepository } from './modules/transactions/transactions.repository.js';
import { TransactionsService } from './modules/transactions/transactions.service.js';
import { DrizzleTransfersRepository } from './modules/transfers/transfers.repository.js';
import { TransfersService } from './modules/transfers/transfers.service.js';
import { DrizzleUsersRepository } from './modules/users/users.repository.js';
import { UsersService } from './modules/users/users.service.js';

type Options = { now?: () => Date };

/**
 * Camadas "de base": repositórios (Drizzle) → services. Pode ser montada sobre uma TRANSAÇÃO SQL
 * (`tx`), o que permite a serviços como a importação executar vários services num só tudo-ou-nada.
 */
function buildCore(db: DrizzleDb, options: Options) {
  const usersRepository = new DrizzleUsersRepository(db);
  const accountsRepository = new DrizzleAccountsRepository(db);
  const categoriesRepository = new DrizzleCategoriesRepository(db);
  const transactionsRepository = new DrizzleTransactionsRepository(db);
  const transfersRepository = new DrizzleTransfersRepository(db);
  const dashboardRepository = new DrizzleDashboardRepository(db);
  const budgetsRepository = new DrizzleBudgetsRepository(db);
  const creditCardsRepository = new DrizzleCreditCardsRepository(db);
  const recurringRepository = new DrizzleRecurringRepository(db);
  const importsRepository = new DrizzleImportsRepository(db);
  const reportsRepository = new ReportsRepository(db);
  const merchantRulesRepository = new DrizzleMerchantRulesRepository(db);
  const now = options.now ? { now: options.now } : {};

  const recurringService = new RecurringService({
    recurring: recurringRepository,
    transactions: transactionsRepository,
    accounts: accountsRepository,
    categories: categoriesRepository,
    users: usersRepository,
    ...now,
  });

  const creditCardsService = new CreditCardsService({
    cards: creditCardsRepository,
    accounts: accountsRepository,
    categories: categoriesRepository,
    users: usersRepository,
    ...now,
  });

  return {
    usersRepository,
    accountsRepository,
    categoriesRepository,
    importsRepository,
    merchantRulesRepository,
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
    creditCardsService,
    reportsService: new ReportsService({
      reports: reportsRepository,
      categories: categoriesRepository,
      budgets: budgetsRepository,
      users: usersRepository,
      ...now,
    }),
    merchantRulesService: new MerchantRulesService({
      rules: merchantRulesRepository,
      accounts: accountsRepository,
      categories: categoriesRepository,
    }),
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

/**
 * Composição completa. Usada pelo servidor (app.ts) e por scripts como o seed, para que todos
 * passem pelas MESMAS regras de negócio.
 */
export function buildDomain(db: DrizzleDb, options: Options = {}) {
  const core = buildCore(db, options);
  const unitOf = (c: ReturnType<typeof buildCore>): ImportsUnit => ({
    imports: c.importsRepository,
    rules: c.merchantRulesRepository,
    transactions: c.transactionsService,
    transfers: c.transfersService,
    cards: c.creditCardsService,
  });

  return {
    ...core,
    importsService: new ImportsService({
      imports: core.importsRepository,
      rules: core.merchantRulesRepository,
      accounts: core.accountsRepository,
      categories: core.categoriesRepository,
      cards: core.creditCardsService,
      users: core.usersRepository,
      // Cada confirmação/desfazer roda inteira numa transação: tudo ou nada.
      withTransaction: (work) =>
        db.transaction((tx) => work(unitOf(buildCore(tx as unknown as DrizzleDb, options)))),
      ...(options.now ? { now: options.now } : {}),
    }),
  };
}

export type Domain = ReturnType<typeof buildDomain>;
