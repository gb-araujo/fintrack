import {
  todayInTimeZone,
  type Budget,
  type BudgetList,
  type UpsertBudgetRequest,
} from '@fintrack/shared';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import type { RecurringService } from '../recurring/recurring.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import type { BudgetsRepository } from './budgets.repository.js';
import { budgetFigures, monthRange } from './domain/budget.js';

export interface BudgetsServiceDeps {
  budgets: BudgetsRepository;
  categories: CategoriesRepository;
  users: UsersRepository;
  recurring: RecurringService;
  now?: () => Date;
}

export class BudgetsService {
  private readonly now: () => Date;

  constructor(private readonly deps: BudgetsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  /** Orçamentos do mês com limite, gasto, restante e percentual — tudo calculado aqui. */
  async list(userId: string, requestedMonth?: string): Promise<BudgetList> {
    const today = await this.today(userId);
    const month = requestedMonth ?? today.slice(0, 7);
    const { from, to } = monthRange(month);

    const [rows, spending, forecast] = await Promise.all([
      this.deps.budgets.list(userId, from),
      this.deps.budgets.spending(userId, from, to),
      // Despesas de recorrências ainda não confirmadas contam como "previstas" no mês.
      this.deps.recurring.forecast(userId, from, to, today),
    ]);

    const spentBy = new Map(spending.map((item) => [item.categoryId, item]));
    const forecastBy = new Map<string, number>();
    for (const item of forecast) {
      if (item.type !== 'expense' || !item.categoryId) continue;
      forecastBy.set(item.categoryId, (forecastBy.get(item.categoryId) ?? 0) + item.amountCents);
    }

    const items: Budget[] = rows.map((row) => {
      const spent = spentBy.get(row.categoryId);
      const figures = budgetFigures(row.limitCents, spent?.spentCents ?? 0);
      return {
        id: row.id,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        month,
        limitCents: row.limitCents,
        spentCents: figures.spentCents,
        pendingCents: (spent?.pendingCents ?? 0) + (forecastBy.get(row.categoryId) ?? 0),
        remainingCents: figures.remainingCents,
        percentUsed: figures.percentUsed,
        status: figures.status,
      };
    });

    const budgetedCategories = new Set(rows.map((row) => row.categoryId));
    const unbudgetedSpentCents = spending
      .filter((item) => item.categoryId === null || !budgetedCategories.has(item.categoryId))
      .reduce((total, item) => total + item.spentCents, 0);
    const limitCents = items.reduce((total, item) => total + item.limitCents, 0);
    const spentCents = items.reduce((total, item) => total + item.spentCents, 0);

    return {
      month,
      items,
      totals: { limitCents, spentCents, remainingCents: limitCents - spentCents },
      unbudgetedSpentCents,
    };
  }

  /** Define (ou altera) o limite mensal de uma categoria de despesa. */
  async upsert(userId: string, input: UpsertBudgetRequest): Promise<Budget> {
    const category = await this.deps.categories.findById(userId, input.categoryId);
    if (!category) throw new NotFoundError('Categoria não encontrada.');
    if (category.kind !== 'expense') {
      throw new BusinessRuleError('Orçamento só existe para categorias de despesa.');
    }
    if (category.archivedAt) throw new ConflictError('A categoria está arquivada.');

    await this.deps.budgets.upsert(userId, {
      categoryId: input.categoryId,
      monthStart: `${input.month}-01`,
      limitCents: input.limitCents,
    });
    const list = await this.list(userId, input.month);
    const budget = list.items.find((item) => item.categoryId === input.categoryId);
    if (!budget) throw new Error('Orçamento recém-gravado não encontrado');
    return budget;
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.deps.budgets.remove(userId, id))) {
      throw new NotFoundError('Orçamento não encontrado.');
    }
  }
}
