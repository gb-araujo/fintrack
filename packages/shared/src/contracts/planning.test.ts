import { describe, expect, it } from 'vitest';
import { monthSchema, upsertBudgetRequestSchema } from './budgets.js';
import { confirmOccurrenceRequestSchema, createRecurringRequestSchema } from './recurring.js';

const accountId = '4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77';
const base = {
  name: 'Aluguel',
  type: 'expense',
  amountCents: 150_000,
  accountId,
  frequency: 'monthly',
  dayOfMonth: 5,
  startDate: '2026-09-05',
} as const;

describe('createRecurringRequestSchema', () => {
  it('aceita recorrência mensal de valor fixo e aplica os padrões', () => {
    const parsed = createRecurringRequestSchema.parse(base);

    expect(parsed).toMatchObject({
      interval: 1,
      autoConfirm: false,
      includeInForecast: true,
      isVariableAmount: false,
    });
  });

  it('mensal exige o dia do vencimento; semanal e anual não', () => {
    const { dayOfMonth: _omit, ...withoutDay } = base;

    expect(createRecurringRequestSchema.safeParse(withoutDay).success).toBe(false);
    expect(
      createRecurringRequestSchema.safeParse({ ...withoutDay, frequency: 'weekly' }).success,
    ).toBe(true);
    expect(
      createRecurringRequestSchema.safeParse({ ...withoutDay, frequency: 'yearly' }).success,
    ).toBe(true);
  });

  it('valor fixo exige valor; valor variável aceita estimativa opcional', () => {
    const { amountCents: _omit, ...withoutAmount } = base;

    expect(createRecurringRequestSchema.safeParse(withoutAmount).success).toBe(false);
    expect(
      createRecurringRequestSchema.safeParse({ ...withoutAmount, isVariableAmount: true }).success,
    ).toBe(true);
  });

  it('confirmação automática só com valor fixo', () => {
    expect(
      createRecurringRequestSchema.safeParse({ ...base, isVariableAmount: true, autoConfirm: true })
        .success,
    ).toBe(false);
    expect(createRecurringRequestSchema.safeParse({ ...base, autoConfirm: true }).success).toBe(
      true,
    );
  });

  it('o fim não pode ser anterior ao início; valores em centavos inteiros positivos', () => {
    expect(createRecurringRequestSchema.safeParse({ ...base, endDate: '2026-09-04' }).success).toBe(
      false,
    );
    expect(createRecurringRequestSchema.safeParse({ ...base, endDate: '2026-09-05' }).success).toBe(
      true,
    );
    expect(createRecurringRequestSchema.safeParse({ ...base, amountCents: 0 }).success).toBe(false);
    expect(createRecurringRequestSchema.safeParse({ ...base, amountCents: 10.5 }).success).toBe(
      false,
    );
  });

  it('dia do mês entre 1 e 31; intervalo entre 1 e 24', () => {
    expect(createRecurringRequestSchema.safeParse({ ...base, dayOfMonth: 32 }).success).toBe(false);
    expect(createRecurringRequestSchema.safeParse({ ...base, dayOfMonth: 0 }).success).toBe(false);
    expect(createRecurringRequestSchema.safeParse({ ...base, interval: 25 }).success).toBe(false);
  });
});

describe('confirmOccurrenceRequestSchema', () => {
  it('valor e data são opcionais; valor precisa ser positivo', () => {
    expect(confirmOccurrenceRequestSchema.safeParse({}).success).toBe(true);
    expect(
      confirmOccurrenceRequestSchema.safeParse({
        amountCents: 19_550,
        transactionDate: '2026-09-27',
      }).success,
    ).toBe(true);
    expect(confirmOccurrenceRequestSchema.safeParse({ amountCents: 0 }).success).toBe(false);
  });
});

describe('orçamentos', () => {
  it('mês no formato AAAA-MM', () => {
    expect(monthSchema.safeParse('2026-09').success).toBe(true);
    expect(monthSchema.safeParse('2026-13').success).toBe(false);
    expect(monthSchema.safeParse('2026-9').success).toBe(false);
    expect(monthSchema.safeParse('2026-09-01').success).toBe(false);
  });

  it('limite positivo em centavos inteiros', () => {
    const input = { categoryId: accountId, month: '2026-09', limitCents: 80_000 };

    expect(upsertBudgetRequestSchema.safeParse(input).success).toBe(true);
    expect(upsertBudgetRequestSchema.safeParse({ ...input, limitCents: 0 }).success).toBe(false);
    expect(upsertBudgetRequestSchema.safeParse({ ...input, limitCents: -5 }).success).toBe(false);
    expect(upsertBudgetRequestSchema.safeParse({ ...input, limitCents: 1.5 }).success).toBe(false);
  });
});
