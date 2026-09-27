import { describe, expect, it } from 'vitest';
import { balanceEffect, computeBalance, entrySign, type BalanceEntry } from './balance.js';

const entry = (overrides: Partial<BalanceEntry>): BalanceEntry => ({
  type: 'expense',
  transferDirection: null,
  amountCents: 1000,
  status: 'completed',
  ...overrides,
});

describe('entrySign', () => {
  it('receita entra, despesa e pagamento de fatura saem', () => {
    expect(entrySign({ type: 'income', transferDirection: null })).toBe(1);
    expect(entrySign({ type: 'expense', transferDirection: null })).toBe(-1);
    expect(entrySign({ type: 'card_payment', transferDirection: null })).toBe(-1);
  });

  it('transferência: entrada soma, saída subtrai', () => {
    expect(entrySign({ type: 'transfer', transferDirection: 'in' })).toBe(1);
    expect(entrySign({ type: 'transfer', transferDirection: 'out' })).toBe(-1);
  });
});

describe('balanceEffect', () => {
  it('só lançamentos efetivados afetam o saldo', () => {
    expect(balanceEffect(entry({ type: 'income', status: 'completed' }))).toBe(1000);
    expect(balanceEffect(entry({ type: 'income', status: 'pending' }))).toBe(0);
    expect(balanceEffect(entry({ type: 'income', status: 'cancelled' }))).toBe(0);
  });
});

describe('computeBalance', () => {
  it('exemplo: saldo inicial + receita − despesa, ignorando pendentes e cancelados', () => {
    const balance = computeBalance(250_000, [
      entry({ type: 'income', amountCents: 500_000 }),
      entry({ type: 'expense', amountCents: 9_099 }),
      entry({ type: 'expense', amountCents: 7_699, status: 'pending' }),
      entry({ type: 'expense', amountCents: 99_999, status: 'cancelled' }),
    ]);
    expect(balance).toBe(250_000 + 500_000 - 9_099);
  });

  it('saldo pode ficar negativo (cheque especial)', () => {
    expect(computeBalance(0, [entry({ amountCents: 15_000 })])).toBe(-15_000);
  });

  it('transferência move dinheiro entre contas sem alterar o total', () => {
    // Inter → Mercado Pago: R$ 300,00
    const inter = computeBalance(100_000, [
      entry({ type: 'transfer', transferDirection: 'out', amountCents: 30_000 }),
    ]);
    const mercadoPago = computeBalance(5_000, [
      entry({ type: 'transfer', transferDirection: 'in', amountCents: 30_000 }),
    ]);

    expect(inter).toBe(70_000);
    expect(mercadoPago).toBe(35_000);
    expect(inter + mercadoPago).toBe(100_000 + 5_000);
  });

  it('não sofre erro de ponto flutuante', () => {
    const entries = Array.from({ length: 10 }, () => entry({ type: 'income', amountCents: 10 }));
    expect(computeBalance(0, entries)).toBe(100);
  });
});
