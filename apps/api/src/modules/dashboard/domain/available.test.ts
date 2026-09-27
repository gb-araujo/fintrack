import { describe, expect, it } from 'vitest';
import { BusinessRuleError } from '../../../shared/errors/index.js';
import { availableAmount, isLiquidForAvailable, resolveHorizon } from './available.js';

const zero = {
  liquidBalanceCents: 0,
  pendingIncomeCents: 0,
  pendingExpensesCents: 0,
  pendingTransfersInCents: 0,
  pendingTransfersOutCents: 0,
};

describe('availableAmount', () => {
  it('exemplo do enunciado: saldo R$ 2.500 − compromissos R$ 1.200 = R$ 1.300', () => {
    expect(
      availableAmount({ ...zero, liquidBalanceCents: 250_000, pendingExpensesCents: 120_000 }),
    ).toBe(130_000);
  });

  it('soma receitas e entradas pendentes; subtrai despesas e saídas pendentes', () => {
    expect(
      availableAmount({
        liquidBalanceCents: 100_000,
        pendingIncomeCents: 50_000,
        pendingExpensesCents: 30_000,
        pendingTransfersInCents: 10_000,
        pendingTransfersOutCents: 25_000,
      }),
    ).toBe(100_000 + 50_000 + 10_000 - 30_000 - 25_000);
  });

  it('pode ficar negativo (comprometido acima do saldo)', () => {
    expect(
      availableAmount({ ...zero, liquidBalanceCents: 10_000, pendingExpensesCents: 25_000 }),
    ).toBe(-15_000);
  });
});

describe('isLiquidForAvailable', () => {
  const base = { type: 'bank' as const, includeInAvailable: true, archivedAt: null };

  it('banco e carteira ativos e marcados entram', () => {
    expect(isLiquidForAvailable(base)).toBe(true);
    expect(isLiquidForAvailable({ ...base, type: 'wallet' })).toBe(true);
  });

  it('investimento nunca entra, mesmo se marcado', () => {
    expect(isLiquidForAvailable({ ...base, type: 'investment' })).toBe(false);
  });

  it('arquivada ou desmarcada não entra', () => {
    expect(isLiquidForAvailable({ ...base, archivedAt: new Date() })).toBe(false);
    expect(isLiquidForAvailable({ ...base, includeInAvailable: false })).toBe(false);
  });
});

describe('resolveHorizon', () => {
  it('padrão: último dia do mês corrente', () => {
    expect(resolveHorizon('2026-09-27')).toBe('2026-09-30');
    expect(resolveHorizon('2026-02-10')).toBe('2026-02-28');
  });

  it('aceita horizonte informado a partir de hoje', () => {
    expect(resolveHorizon('2026-09-27', '2026-09-27')).toBe('2026-09-27');
    expect(resolveHorizon('2026-09-27', '2026-12-31')).toBe('2026-12-31');
  });

  it('recusa horizonte no passado', () => {
    expect(() => resolveHorizon('2026-09-27', '2026-09-26')).toThrow(BusinessRuleError);
  });
});
