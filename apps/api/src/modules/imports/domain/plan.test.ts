import type { ImportDecision } from '@fintrack/shared';
import { describe, expect, it } from 'vitest';
import { PlanError, planRow, rulePatternFrom, type PlannableRow } from './plan.js';

const account = 'acc-inter';
const row = (overrides: Partial<PlannableRow> = {}): PlannableRow => ({
  id: 'r1',
  direction: 'out',
  description: 'PADARIA DO ZE',
  normalizedDescription: 'PADARIA DO ZE',
  suggestedType: 'expense',
  suggestedCategoryId: 'cat-food',
  suggestedTargetAccountId: null,
  suggestedInvoiceId: null,
  defaultAction: 'import',
  ...overrides,
});
const decision = (overrides: Partial<ImportDecision> = {}): ImportDecision => ({
  rowId: 'r1',
  action: 'import',
  ...overrides,
});

describe('planRow', () => {
  it('sem decisão: segue a ação padrão e a sugestão', () => {
    expect(planRow(row(), undefined, account)).toEqual({
      action: 'import',
      rowId: 'r1',
      type: 'expense',
      categoryId: 'cat-food',
      targetAccountId: null,
      invoiceId: null,
      description: 'PADARIA DO ZE',
      saveRule: false,
    });
    expect(planRow(row({ defaultAction: 'skip' }), undefined, account)).toEqual({
      action: 'skip',
      rowId: 'r1',
    });
  });

  it('a decisão do usuário vence o padrão (importar uma duplicata, pular uma linha normal)', () => {
    expect(planRow(row({ defaultAction: 'skip' }), decision(), account).action).toBe('import');
    expect(planRow(row(), decision({ action: 'skip' }), account).action).toBe('skip');
  });

  it('categoria: a decisão vence; null limpa; sugestão só vale se o tipo não mudou', () => {
    expect(planRow(row(), decision({ categoryId: 'cat-other' }), account)).toMatchObject({
      categoryId: 'cat-other',
    });
    expect(planRow(row(), decision({ categoryId: null }), account)).toMatchObject({
      categoryId: null,
    });
    const inflow = row({ direction: 'in', suggestedType: 'expense' });
    expect(planRow(inflow, decision({ type: 'income' }), account)).toMatchObject({
      type: 'income',
      categoryId: null,
    });
  });

  it('receita só entra; despesa e pagamento de fatura só saem', () => {
    expect(() => planRow(row(), decision({ type: 'income' }), account)).toThrow(PlanError);
    expect(() =>
      planRow(
        row({ direction: 'in', suggestedType: 'income' }),
        decision({ type: 'expense' }),
        account,
      ),
    ).toThrow(/entrada de dinheiro.*despesa/);
    expect(() =>
      planRow(
        row({ direction: 'in', suggestedType: 'income' }),
        decision({ type: 'card_payment', invoiceId: 'inv' }),
        account,
      ),
    ).toThrow(/pagamento de fatura/);
  });

  it('transferência exige outra conta (decisão ou sugestão) e não tem categoria', () => {
    expect(() => planRow(row(), decision({ type: 'transfer' }), account)).toThrow(/outra conta/);
    expect(() =>
      planRow(row(), decision({ type: 'transfer', targetAccountId: account }), account),
    ).toThrow(/diferente/);
    expect(() =>
      planRow(
        row(),
        decision({ type: 'transfer', targetAccountId: 'mp', categoryId: 'cat-food' }),
        account,
      ),
    ).toThrow(/não têm categoria/);
    const suggested = row({
      suggestedType: 'transfer',
      suggestedCategoryId: null,
      suggestedTargetAccountId: 'mp',
    });
    expect(planRow(suggested, undefined, account)).toMatchObject({
      type: 'transfer',
      targetAccountId: 'mp',
      categoryId: null,
    });
  });

  it('pagamento de fatura exige a fatura; nunca salva regra', () => {
    const payment = row({ suggestedType: 'card_payment', suggestedCategoryId: null });
    expect(() => planRow(payment, undefined, account)).toThrow(/fatura/);
    expect(
      planRow(payment, decision({ invoiceId: 'inv-1', saveRule: true }), account),
    ).toMatchObject({
      type: 'card_payment',
      invoiceId: 'inv-1',
      saveRule: false,
    });
  });

  it('descrição: a informada (aparada) ou a do extrato, até 200 caracteres', () => {
    expect(planRow(row(), decision({ description: '  Pão  ' }), account)).toMatchObject({
      description: 'Pão',
    });
    expect(planRow(row({ description: 'x'.repeat(300) }), undefined, account)).toMatchObject({
      description: 'x'.repeat(200),
    });
  });
});

describe('rulePatternFrom', () => {
  it('tira números soltos (datas, ids) e fica com as primeiras palavras', () => {
    expect(rulePatternFrom('PADARIA DO ZE 1234')).toBe('PADARIA DO ZE');
    expect(rulePatternFrom('COMPRA 12 09 PADARIA 2026')).toBe('COMPRA PADARIA');
    expect(rulePatternFrom('')).toBe('');
  });

  it('limita a 60 caracteres em fronteira de palavra', () => {
    const long = Array.from({ length: 30 }, (_, i) => `PALAVRA${i}`).join(' ');

    const pattern = rulePatternFrom(long);

    expect(pattern.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(pattern)).toBe(true);
  });
});
