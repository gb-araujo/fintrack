import { describe, expect, it } from 'vitest';
import { buildCashflow, type CashflowItem } from './cashflow.js';

const TODAY = '2026-09-27';

function item(
  overrides: Partial<CashflowItem> & Pick<CashflowItem, 'direction' | 'amountCents' | 'date'>,
): CashflowItem {
  return {
    id: overrides.description ?? `${overrides.direction}-${overrides.date}`,
    kind: 'transaction',
    description: '',
    estimated: false,
    overdue: overrides.date < TODAY,
    accountId: null,
    recurringId: null,
    invoiceId: null,
    ...overrides,
  };
}

describe('buildCashflow', () => {
  it('sem itens: saldo de hoje é o menor saldo e o que dá para gastar', () => {
    const flow = buildCashflow(50_000, [], TODAY);

    expect(flow).toEqual({
      entries: [],
      inCents: 0,
      outCents: 0,
      lowestBalanceCents: 50_000,
      lowestBalanceDate: TODAY,
      safeToSpendNowCents: 50_000,
    });
  });

  it('aplica em ordem de data e devolve o saldo depois de cada item', () => {
    const flow = buildCashflow(
      10_000,
      [
        item({ description: 'Salário', direction: 'in', amountCents: 300_000, date: '2026-10-05' }),
        item({ description: 'Luz', direction: 'out', amountCents: 20_000, date: '2026-10-01' }),
      ],
      TODAY,
    );

    expect(flow.entries.map((e) => [e.description, e.balanceAfterCents])).toEqual([
      ['Luz', -10_000],
      ['Salário', 290_000],
    ]);
    expect(flow).toMatchObject({
      inCents: 300_000,
      outCents: 20_000,
      lowestBalanceCents: -10_000,
      lowestBalanceDate: '2026-10-01',
      // A conta vence antes do salário: hoje não dá para gastar nada.
      safeToSpendNowCents: 0,
    });
  });

  it('saldo final = saldo de hoje + entradas − saídas (bate com o "disponível")', () => {
    const flow = buildCashflow(
      100_000,
      [
        item({ direction: 'in', amountCents: 40_000, date: '2026-10-03' }),
        item({ direction: 'out', amountCents: 15_000, date: '2026-10-02' }),
        item({ direction: 'out', amountCents: 5_000, date: '2026-10-09' }),
      ],
      TODAY,
    );

    expect(flow.entries.at(-1)?.balanceAfterCents).toBe(100_000 + 40_000 - 15_000 - 5_000);
    expect(flow.lowestBalanceCents).toBe(85_000);
    expect(flow.safeToSpendNowCents).toBe(85_000);
  });

  it('no mesmo dia, entrada antes da saída', () => {
    const flow = buildCashflow(
      0,
      [
        item({
          description: 'Aluguel',
          direction: 'out',
          amountCents: 150_000,
          date: '2026-10-05',
        }),
        item({ description: 'Salário', direction: 'in', amountCents: 500_000, date: '2026-10-05' }),
      ],
      TODAY,
    );

    expect(flow.entries.map((e) => e.description)).toEqual(['Salário', 'Aluguel']);
    expect(flow.lowestBalanceCents).toBe(0);
  });

  it('vencidos contam como hoje: vêm primeiro e o menor saldo cai hoje', () => {
    const flow = buildCashflow(
      30_000,
      [
        item({ description: 'Futura', direction: 'out', amountCents: 1_000, date: '2026-10-01' }),
        item({
          description: 'Atrasada',
          direction: 'out',
          amountCents: 50_000,
          date: '2026-09-20',
        }),
      ],
      TODAY,
    );

    expect(flow.entries.map((e) => [e.description, e.overdue])).toEqual([
      ['Atrasada', true],
      ['Futura', false],
    ]);
    expect(flow.lowestBalanceCents).toBe(-21_000);
    expect(flow.lowestBalanceDate).toBe('2026-10-01');
    expect(flow.entries[0]?.balanceAfterCents).toBe(-20_000);
  });

  it('o menor saldo registra a data em que acontece (vencido → hoje)', () => {
    const flow = buildCashflow(
      10_000,
      [
        item({ direction: 'out', amountCents: 50_000, date: '2026-09-01' }),
        item({ direction: 'in', amountCents: 100_000, date: '2026-10-01' }),
      ],
      TODAY,
    );

    expect(flow.lowestBalanceCents).toBe(-40_000);
    expect(flow.lowestBalanceDate).toBe(TODAY);
  });
});
