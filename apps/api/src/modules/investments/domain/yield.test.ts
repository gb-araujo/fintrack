import { describe, expect, it } from 'vitest';
import { computeYield } from './yield.js';

describe('computeYield', () => {
  it('rendimento positivo: saldo cresceu mais do que os aportes explicam', () => {
    expect(computeYield(100_000, 120_000, 15_000)).toEqual({ yieldCents: 5_000, yieldPercent: 5 });
  });

  it('rendimento negativo: perda mesmo descontando resgates', () => {
    expect(computeYield(100_000, 80_000, -10_000)).toEqual({
      yieldCents: -10_000,
      yieldPercent: -10,
    });
  });

  it('sem aportes nem resgates: rendimento = variação bruta do saldo', () => {
    expect(computeYield(100_000, 105_000, 0)).toEqual({ yieldCents: 5_000, yieldPercent: 5 });
  });

  it('saldo inicial zero: percentual indefinido (null), rendimento em reais normal', () => {
    expect(computeYield(0, 1_000, 0)).toEqual({ yieldCents: 1_000, yieldPercent: null });
  });

  it('aportes que exatamente explicam a variação: rendimento zero', () => {
    expect(computeYield(100_000, 130_000, 30_000)).toEqual({ yieldCents: 0, yieldPercent: 0 });
  });

  it('arredonda o percentual para duas casas decimais', () => {
    expect(computeYield(300_000, 310_000, 0).yieldPercent).toBeCloseTo(3.33, 2);
  });
});
