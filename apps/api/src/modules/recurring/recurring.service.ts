import {
  addDaysToDate,
  todayInTimeZone,
  type ConfirmOccurrenceRequest,
  type CreateRecurringRequest,
  type UpdateRecurringRequest,
} from '@fintrack/shared';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import {
  assertAccountAcceptsEntry,
  assertCategoryFits,
  resolveCompletionDate,
} from '../transactions/domain/transaction-rules.js';
import type { TransactionsRepository } from '../transactions/transactions.repository.js';
import type { TransactionRecord } from '../transactions/transactions.types.js';
import type { UsersRepository } from '../users/users.repository.js';
import {
  isOccurrence,
  nextOccurrence,
  occurrencesBetween,
  type RecurrenceRule,
} from './domain/recurrence.js';
import type { RecurringRepository } from './recurring.repository.js';
import type { ForecastOccurrence, RecurringPatch, RecurringRecord } from './recurring.types.js';

/**
 * Ocorrências não confirmadas mais antigas que isto são ignoradas (consideradas já refletidas no
 * saldo inicial ou esquecidas). Dentro da janela, ficam como "atrasadas" até o usuário confirmar ou pular.
 */
export const RECURRING_LOOKBACK_DAYS = 62;
export const DEFAULT_FORECAST_DAYS = 60;

export interface RecurringServiceDeps {
  recurring: RecurringRepository;
  transactions: TransactionsRepository;
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  users: UsersRepository;
  now?: () => Date;
}

function toRule(record: RecurringRecord): RecurrenceRule {
  return {
    frequency: record.frequency,
    interval: record.interval,
    dayOfMonth: record.dayOfMonth,
    startDate: record.startDate,
    endDate: record.endDate,
  };
}

/** Valor previsto: o fixo; ou (variável) o último efetivado, senão a estimativa, senão zero. */
function effectiveAmount(rule: RecurringRecord, lastConfirmed: Map<string, number>) {
  if (!rule.isVariableAmount) return { amountCents: rule.amountCents ?? 0, estimated: false };
  return { amountCents: lastConfirmed.get(rule.id) ?? rule.amountCents ?? 0, estimated: true };
}

/**
 * Recorrências (ADR 0008): uma regra gera PREVISÕES (ocorrências virtuais). Nada vira lançamento
 * sem confirmação — exceto regras com `autoConfirm` (valor fixo), que se confirmam ao chegar o dia.
 * Uma ocorrência com lançamento vinculado (confirmado OU pulado) deixa de ser previsão.
 */
export class RecurringService {
  private readonly now: () => Date;

  constructor(private readonly deps: RecurringServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  // ---------- Cadastro ----------

  async list(userId: string, includeInactive: boolean) {
    const rules = await this.deps.recurring.list(userId, { includeInactive });
    return this.withNextDates(userId, rules);
  }

  /** Uma regra com a próxima ocorrência ainda não confirmada. */
  async getWithNext(userId: string, id: string) {
    const rule = await this.get(userId, id);
    const [item] = await this.withNextDates(userId, [rule]);
    return item as { rule: RecurringRecord; nextDate: string | null };
  }

  private async withNextDates(userId: string, rules: RecurringRecord[]) {
    const today = await this.today(userId);
    const linked = await this.deps.recurring.linkedOccurrences(
      userId,
      today,
      addDaysToDate(today, 400),
    );
    const done = new Set(linked.map((item) => `${item.recurringId}|${item.occurrenceDate}`));

    return rules.map((rule) => {
      // Próxima ocorrência a partir de hoje que ainda não virou lançamento.
      let cursor = today;
      let next: string | null = null;
      for (let i = 0; i < 24 && rule.active; i++) {
        const candidate = nextOccurrence(toRule(rule), cursor);
        if (candidate === null) break;
        if (!done.has(`${rule.id}|${candidate}`)) {
          next = candidate;
          break;
        }
        cursor = addDaysToDate(candidate, 1);
      }
      return { rule, nextDate: next };
    });
  }

  async get(userId: string, id: string): Promise<RecurringRecord> {
    return this.require(await this.deps.recurring.findById(userId, id));
  }

  async create(userId: string, input: CreateRecurringRequest): Promise<RecurringRecord> {
    const account = await this.requireAccount(userId, input.accountId);
    assertAccountAcceptsEntry(account, input.type);
    if (input.categoryId) await this.requireFittingCategory(userId, input.categoryId, input.type);

    return this.deps.recurring.create(userId, {
      name: input.name,
      type: input.type,
      amountCents: input.amountCents ?? null,
      isVariableAmount: input.isVariableAmount ?? false,
      accountId: input.accountId,
      categoryId: input.categoryId ?? null,
      frequency: input.frequency,
      interval: input.interval ?? 1,
      // Semanal usa o dia da semana da data de início; mensal e anual usam o dia informado.
      dayOfMonth: input.frequency === 'weekly' ? null : (input.dayOfMonth ?? null),
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      autoConfirm: input.autoConfirm ?? false,
      includeInForecast: input.includeInForecast ?? true,
    });
  }

  async update(
    userId: string,
    id: string,
    input: UpdateRecurringRequest,
  ): Promise<RecurringRecord> {
    const current = await this.get(userId, id);

    const isVariable = input.isVariableAmount ?? current.isVariableAmount;
    const amount = input.amountCents !== undefined ? input.amountCents : current.amountCents;
    const autoConfirm = input.autoConfirm ?? current.autoConfirm;
    const dayOfMonth = input.dayOfMonth !== undefined ? input.dayOfMonth : current.dayOfMonth;
    const endDate = input.endDate !== undefined ? input.endDate : current.endDate;

    if (!isVariable && (amount === null || amount === undefined))
      throw new BusinessRuleError('Informe o valor.');
    if (autoConfirm && isVariable) {
      throw new BusinessRuleError('Confirmação automática só vale para valor fixo.');
    }
    if (current.frequency === 'monthly' && !dayOfMonth) {
      throw new BusinessRuleError('Informe o dia do vencimento.');
    }
    if (endDate && endDate < current.startDate) {
      throw new BusinessRuleError('O fim deve ser depois do início.');
    }
    if (input.accountId !== undefined && input.accountId !== current.accountId) {
      assertAccountAcceptsEntry(await this.requireAccount(userId, input.accountId), current.type);
    }
    if (input.categoryId) await this.requireFittingCategory(userId, input.categoryId, current.type);

    const patch: RecurringPatch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
      ...(input.isVariableAmount !== undefined ? { isVariableAmount: input.isVariableAmount } : {}),
      ...(input.accountId !== undefined ? { accountId: input.accountId } : {}),
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.interval !== undefined ? { interval: input.interval } : {}),
      ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
      ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      ...(input.autoConfirm !== undefined ? { autoConfirm: input.autoConfirm } : {}),
      ...(input.includeInForecast !== undefined
        ? { includeInForecast: input.includeInForecast }
        : {}),
    };
    return this.require(await this.deps.recurring.update(userId, id, patch));
  }

  /** Recorrências nunca são apagadas: ficam inativas (os lançamentos já confirmados permanecem). */
  async setActive(userId: string, id: string, active: boolean): Promise<RecurringRecord> {
    await this.get(userId, id);
    return this.require(await this.deps.recurring.setActive(userId, id, active));
  }

  // ---------- Previsões ----------

  /** Ocorrências previstas (virtuais, ainda sem lançamento) em [from, to], das mais antigas às mais novas. */
  async forecast(
    userId: string,
    from: string,
    to: string,
    today: string,
  ): Promise<ForecastOccurrence[]> {
    const [rules, linked, lastConfirmed] = await Promise.all([
      this.deps.recurring.listActiveWithAccounts(userId),
      this.deps.recurring.linkedOccurrences(userId, from, to),
      this.deps.recurring.lastConfirmedAmounts(userId),
    ]);
    const done = new Set(linked.map((item) => `${item.recurringId}|${item.occurrenceDate}`));

    const items: ForecastOccurrence[] = [];
    for (const rule of rules) {
      const { amountCents, estimated } = effectiveAmount(rule, lastConfirmed);
      for (const date of occurrencesBetween(toRule(rule), from, to)) {
        if (done.has(`${rule.id}|${date}`)) continue;
        items.push({
          recurringId: rule.id,
          name: rule.name,
          type: rule.type,
          date,
          amountCents,
          estimated,
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          overdue: date < today,
          accountLiquid: rule.accountLiquid,
          accountUsable: rule.accountUsable,
          includeInForecast: rule.includeInForecast,
        });
      }
    }
    return items.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  }

  /** Previsões para a tela de recorrências: atrasadas (janela de 62 dias) + próximas (padrão 60 dias). */
  async occurrences(userId: string, requestedUntil?: string) {
    await this.materializeAutoConfirmed(userId);
    const today = await this.today(userId);
    const until = requestedUntil ?? addDaysToDate(today, DEFAULT_FORECAST_DAYS);
    if (until < today) throw new BusinessRuleError('O período não pode terminar antes de hoje.');
    const from = addDaysToDate(today, -RECURRING_LOOKBACK_DAYS);
    return { from, until, items: await this.forecast(userId, from, until, today) };
  }

  // ---------- Confirmar / pular ----------

  /** Confirma uma ocorrência: cria o lançamento efetivado vinculado a ela. */
  async confirm(
    userId: string,
    id: string,
    date: string,
    input: ConfirmOccurrenceRequest = {},
  ): Promise<TransactionRecord> {
    const rule = await this.requireOccurrence(userId, id, date);
    const today = await this.today(userId);
    const transactionDate = resolveCompletionDate(date, input.transactionDate, today);

    const lastConfirmed = await this.deps.recurring.lastConfirmedAmounts(userId);
    const predicted = effectiveAmount(rule, lastConfirmed).amountCents;
    const amountCents = input.amountCents ?? (predicted > 0 ? predicted : undefined);
    if (!amountCents) throw new BusinessRuleError('Informe o valor pago ou recebido.');

    const account = await this.requireAccount(userId, rule.accountId);
    assertAccountAcceptsEntry(account, rule.type);

    return this.deps.transactions.create(userId, {
      accountId: rule.accountId,
      categoryId: await this.usableCategoryId(userId, rule),
      type: rule.type,
      amountCents,
      description: rule.name,
      transactionDate,
      paymentMethod: null,
      status: 'completed',
      recurring: { id: rule.id, occurrenceDate: date },
    });
  }

  /**
   * Pula uma ocorrência (ex.: conta que não veio este mês): grava um lançamento CANCELADO vinculado a
   * ela, que a tira das previsões sem afetar saldo, relatórios ou orçamento.
   */
  async skip(userId: string, id: string, date: string): Promise<TransactionRecord> {
    const rule = await this.requireOccurrence(userId, id, date);
    const lastConfirmed = await this.deps.recurring.lastConfirmedAmounts(userId);
    return this.deps.transactions.create(userId, {
      accountId: rule.accountId,
      categoryId: await this.usableCategoryId(userId, rule),
      type: rule.type,
      // Valor apenas de marcação (todo lançamento exige valor > 0); cancelado não conta em nada.
      amountCents: Math.max(1, effectiveAmount(rule, lastConfirmed).amountCents),
      description: rule.name,
      transactionDate: date,
      paymentMethod: null,
      status: 'cancelled',
      recurring: { id: rule.id, occurrenceDate: date },
    });
  }

  /**
   * Confirmação automática: regras com `autoConfirm` (valor fixo) viram lançamentos efetivados quando o
   * dia chega. Idempotente (UNIQUE por ocorrência) e segura para chamadas concorrentes.
   */
  async materializeAutoConfirmed(userId: string): Promise<number> {
    const rules = (await this.deps.recurring.listActiveWithAccounts(userId)).filter(
      (rule) =>
        rule.autoConfirm && !rule.isVariableAmount && rule.amountCents && rule.accountUsable,
    );
    if (rules.length === 0) return 0;

    const today = await this.today(userId);
    const from = addDaysToDate(today, -RECURRING_LOOKBACK_DAYS);
    const linked = await this.deps.recurring.linkedOccurrences(userId, from, today);
    const done = new Set(linked.map((item) => `${item.recurringId}|${item.occurrenceDate}`));

    let created = 0;
    for (const rule of rules) {
      for (const date of occurrencesBetween(toRule(rule), from, today)) {
        if (done.has(`${rule.id}|${date}`)) continue;
        try {
          await this.deps.transactions.create(userId, {
            accountId: rule.accountId,
            categoryId: await this.usableCategoryId(userId, rule),
            type: rule.type,
            amountCents: rule.amountCents ?? 0,
            description: rule.name,
            transactionDate: date,
            paymentMethod: null,
            status: 'completed',
            recurring: { id: rule.id, occurrenceDate: date },
          });
          created++;
        } catch (error) {
          if (!(error instanceof ConflictError)) throw error; // outra requisição já confirmou
        }
      }
    }
    return created;
  }

  // ---------- Auxiliares ----------

  private async requireOccurrence(
    userId: string,
    id: string,
    date: string,
  ): Promise<RecurringRecord> {
    const rule = await this.get(userId, id);
    if (!rule.active) throw new ConflictError('A recorrência está inativa.');
    if (!isOccurrence(toRule(rule), date)) throw new NotFoundError('Ocorrência não encontrada.');
    return rule;
  }

  /** Categoria da regra, se ainda existir ativa e do tipo certo; senão o lançamento fica sem categoria. */
  private async usableCategoryId(userId: string, rule: RecurringRecord): Promise<string | null> {
    if (!rule.categoryId) return null;
    const category = await this.deps.categories.findById(userId, rule.categoryId);
    if (!category || category.archivedAt || category.kind !== rule.type) return null;
    return category.id;
  }

  private async requireAccount(userId: string, accountId: string) {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (!account) throw new NotFoundError('Conta não encontrada.');
    return account;
  }

  private async requireFittingCategory(
    userId: string,
    categoryId: string,
    type: 'income' | 'expense',
  ) {
    const category = await this.deps.categories.findById(userId, categoryId);
    if (!category) throw new NotFoundError('Categoria não encontrada.');
    assertCategoryFits(category, type);
  }

  private require(record: RecurringRecord | undefined): RecurringRecord {
    if (!record) throw new NotFoundError('Recorrência não encontrada.');
    return record;
  }
}
