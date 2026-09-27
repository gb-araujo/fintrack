import {
  addDaysToDate,
  endOfMonth,
  MAX_REPORT_DAYS,
  startOfMonth,
  todayInTimeZone,
  type BudgetHistory,
  type CashFlow,
  type ExpensesByAccount,
  type ExpensesByCard,
  type ExpensesByCategory,
  type IncomeVsExpenses,
  type InvestmentsReport,
  type MonthlyEvolution,
  type NetWorth,
  type ReportMonthsQuery,
  type ReportPeriod,
  type ReportPeriodQuery,
} from '@fintrack/shared';
import { BusinessRuleError, NotFoundError } from '../../shared/errors/index.js';
import type { BudgetsRepository } from '../budgets/budgets.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { ReportsRepository } from './reports.repository.js';

export interface ReportsServiceDeps {
  reports: ReportsRepository;
  categories: CategoriesRepository;
  budgets: BudgetsRepository;
  users: UsersRepository;
  now?: () => Date;
}

/** % inteiro arredondado; 0 quando o total é zero. */
export function percentOf(part: number, total: number): number {
  return total > 0 ? Math.round((part * 100) / total) : 0;
}

/** Soma `delta` meses a "AAAA-MM". */
export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Os N meses terminando em `until`, do mais antigo ao mais recente. */
export function monthsBack(until: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => shiftMonth(until, index - (count - 1)));
}

/**
 * Relatórios (ADR 0019). Somente leitura: cada número vem de consultas que reutilizam as definições do
 * painel, do orçamento e das faturas — por isso os relatórios fecham entre si e com o painel.
 */
export class ReportsService {
  private readonly now: () => Date;

  constructor(private readonly deps: ReportsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  /** Período pedido ou o mês corrente (fuso do usuário). Limita a ~5 anos. */
  private async resolvePeriod(userId: string, query: ReportPeriodQuery): Promise<ReportPeriod> {
    const today = await this.today(userId);
    const from = query.from ?? startOfMonth(today);
    const to = query.to ?? (endOfMonth(today) >= from ? endOfMonth(today) : from);
    if (to < from)
      throw new BusinessRuleError('A data inicial deve ser anterior ou igual à final.');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
    if (days > MAX_REPORT_DAYS) {
      throw new BusinessRuleError('O período é longo demais (máximo de 5 anos).');
    }
    return { from, to };
  }

  private async currentMonth(userId: string, until?: string): Promise<string> {
    return until ?? (await this.today(userId)).slice(0, 7);
  }

  async expensesByCategory(userId: string, query: ReportPeriodQuery): Promise<ExpensesByCategory> {
    const period = await this.resolvePeriod(userId, query);
    const [rows, categories] = await Promise.all([
      this.deps.reports.expensesByCategory(userId, period.from, period.to),
      this.deps.categories.list(userId, { includeArchived: true }),
    ]);
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const items = rows
      .map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryId ? (names.get(row.categoryId) ?? 'Categoria') : 'Sem categoria',
        totalCents: row.accountCents + row.cardCents,
        accountCents: row.accountCents,
        cardCents: row.cardCents,
      }))
      .filter((item) => item.totalCents > 0)
      .sort((a, b) => b.totalCents - a.totalCents || a.categoryName.localeCompare(b.categoryName));
    const totalCents = items.reduce((total, item) => total + item.totalCents, 0);
    return {
      period,
      totalCents,
      items: items.map((item) => ({ ...item, percent: percentOf(item.totalCents, totalCents) })),
    };
  }

  async incomeVsExpenses(userId: string, query: ReportPeriodQuery): Promise<IncomeVsExpenses> {
    const period = await this.resolvePeriod(userId, query);
    const totals = await this.deps.reports.incomeExpenseTotals(userId, period.from, period.to);
    const expenseCents = totals.accountExpenseCents + totals.cardExpenseCents;
    const netCents = totals.incomeCents - expenseCents;
    return {
      period,
      incomeCents: totals.incomeCents,
      expenseCents,
      cardExpenseCents: totals.cardExpenseCents,
      netCents,
      savingsPercent:
        totals.incomeCents > 0 ? Math.round((netCents * 100) / totals.incomeCents) : null,
    };
  }

  async monthlyEvolution(userId: string, query: ReportMonthsQuery): Promise<MonthlyEvolution> {
    const until = await this.currentMonth(userId, query.until);
    const months = monthsBack(until, query.months);
    const rows = await this.deps.reports.monthlySeries(
      userId,
      `${months[0]}-01`,
      endOfMonth(`${until}-01`),
    );
    const byMonth = new Map(rows.map((row) => [row.month, row]));
    return {
      items: months.map((month) => {
        const row = byMonth.get(month);
        const expenseCents = (row?.accountExpenseCents ?? 0) + (row?.cardExpenseCents ?? 0);
        const incomeCents = row?.incomeCents ?? 0;
        return {
          month,
          incomeCents,
          expenseCents,
          cardExpenseCents: row?.cardExpenseCents ?? 0,
          netCents: incomeCents - expenseCents,
        };
      }),
    };
  }

  async expensesByAccount(userId: string, query: ReportPeriodQuery): Promise<ExpensesByAccount> {
    const period = await this.resolvePeriod(userId, query);
    const rows = await this.deps.reports.expensesByAccount(userId, period.from, period.to);
    const totalCents = rows.reduce((total, row) => total + row.totalCents, 0);
    return {
      period,
      totalCents,
      items: rows.map((row) => ({ ...row, percent: percentOf(row.totalCents, totalCents) })),
    };
  }

  async expensesByCard(userId: string, query: ReportPeriodQuery): Promise<ExpensesByCard> {
    const period = await this.resolvePeriod(userId, query);
    const rows = await this.deps.reports.expensesByCard(userId, period.from, period.to);
    const items = rows.filter((row) => row.installmentsCents > 0 || row.purchasedCents > 0);
    return {
      period,
      installmentsCents: items.reduce((total, row) => total + row.installmentsCents, 0),
      purchasedCents: items.reduce((total, row) => total + row.purchasedCents, 0),
      items,
    };
  }

  async cashFlow(userId: string, query: ReportPeriodQuery): Promise<CashFlow> {
    const period = await this.resolvePeriod(userId, query);
    const [opening, closing, movements] = await Promise.all([
      this.deps.reports.liquidBalanceAt(userId, addDaysToDate(period.from, -1)),
      this.deps.reports.liquidBalanceAt(userId, period.to),
      this.deps.reports.cashFlowMovements(userId, period.from, period.to),
    ]);
    return {
      period,
      openingBalanceCents: opening,
      closingBalanceCents: closing,
      ...movements,
      netCents:
        movements.incomeCents +
        movements.transfersInCents -
        movements.expensesCents -
        movements.cardPaymentsCents -
        movements.transfersOutCents,
    };
  }

  async budgetHistory(userId: string, query: ReportMonthsQuery): Promise<BudgetHistory> {
    const until = await this.currentMonth(userId, query.until);
    const items = [];
    for (const month of monthsBack(until, query.months)) {
      const from = `${month}-01`;
      const [budgets, spending] = await Promise.all([
        this.deps.budgets.list(userId, from),
        this.deps.budgets.spending(userId, from, endOfMonth(from)),
      ]);
      const spentBy = new Map(spending.map((row) => [row.categoryId, row.spentCents]));
      let limitCents = 0;
      let spentCents = 0;
      let exceededCount = 0;
      for (const budget of budgets) {
        const spent = spentBy.get(budget.categoryId) ?? 0;
        limitCents += budget.limitCents;
        spentCents += spent;
        if (spent > budget.limitCents) exceededCount++;
      }
      items.push({
        month,
        budgetsCount: budgets.length,
        limitCents,
        spentCents,
        remainingCents: limitCents - spentCents,
        exceededCount,
      });
    }
    return { items };
  }

  async netWorth(userId: string, query: ReportMonthsQuery): Promise<NetWorth> {
    const today = await this.today(userId);
    const until = query.until ?? today.slice(0, 7);
    const dates = monthsBack(until, query.months).map((month) => {
      const end = endOfMonth(`${month}-01`);
      return end > today ? today : end;
    });
    const unique = [...new Set(dates)];
    const points = await this.deps.reports.balancesAt(userId, unique);
    return {
      items: points.map((point) => ({
        date: point.date,
        cashCents: point.cashCents,
        investmentsCents: point.investmentsCents,
        cardLiabilitiesCents: point.cardLiabilitiesCents,
        netWorthCents: point.cashCents + point.investmentsCents - point.cardLiabilitiesCents,
      })),
    };
  }

  async investments(userId: string, query: ReportPeriodQuery): Promise<InvestmentsReport> {
    const period = await this.resolvePeriod(userId, query);
    const items = await this.deps.reports.investmentAccounts(userId, period.from, period.to);
    const known = items.filter((item) => item.yieldCents !== null);
    return {
      period,
      totalBalanceCents: items.reduce((total, item) => total + item.balanceCents, 0),
      appliedCents: items.reduce((total, item) => total + item.appliedCents, 0),
      redeemedCents: items.reduce((total, item) => total + item.redeemedCents, 0),
      // null só quando NENHUMA conta tem avaliação; contas sem avaliação simplesmente não entram na soma.
      yieldCents:
        known.length > 0 ? known.reduce((total, item) => total + (item.yieldCents ?? 0), 0) : null,
      items,
    };
  }
}
