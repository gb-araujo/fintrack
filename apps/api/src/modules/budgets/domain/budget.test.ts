import { describe, expect, it } from 'vitest';
import { budgetFigures, monthRange } from './budget.js';

describe('budgetFigures', () => {
  it('exemplo: Alimentação R$ 800, gasto R$ 200 → restante R$ 600, 25%, ok', () => {
    expect(budgetFigures(80_000, 20_000)).toEqual({
      limitCents: 80_000,
      spentCents: 20_000,
      remainingCents: 60_000,
      percentUsed: 25,
      status: 'ok',
    });
  });

  it('80% ou mais é atenção; acima do limite é estourado (restante negativo)', () => {
    expect(budgetFigures(30_000, 24_000).status).toBe('warning');
    expect(budgetFigures(30_000, 30_000)).toMatchObject({
      status: 'warning',
      percentUsed: 100,
      remainingCents: 0,
    });
    expect(budgetFigures(30_000, 30_001)).toMatchObject({ status: 'exceeded', remainingCents: -1 });
    expect(budgetFigures(40_000, 52_000)).toMatchObject({
      status: 'exceeded',
      percentUsed: 130,
      remainingCents: -12_000,
    });
  });

  it('sem gasto: 0%', () => {
    expect(budgetFigures(40_000, 0)).toMatchObject({
      percentUsed: 0,
      status: 'ok',
      remainingCents: 40_000,
    });
  });

  it('percentual arredondado sem afetar os centavos', () => {
    const figures = budgetFigures(30_000, 10_001); // 33,3367%
    expect(figures.percentUsed).toBe(33);
    expect(figures.remainingCents).toBe(19_999);
  });
});

describe('monthRange', () => {
  it('primeiro e último dia, inclusive fevereiro bissexto', () => {
    expect(monthRange('2026-09')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
});
