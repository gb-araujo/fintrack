import { describe, expect, it } from 'vitest';
import { splitInstallments } from './installments.js';
import {
  addMonths,
  closingMonthOf,
  daysInMonth,
  installmentPeriods,
  invoicePeriodClosingIn,
  invoicePeriodForPurchase,
} from './invoice-period.js';
import { invoiceState, payableCents } from './invoice-status.js';

function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ymd = (date: Date) => date.toISOString().slice(0, 10);

describe('splitInstallments', () => {
  it('R$ 900 em 3x = 300 + 300 + 300', () => {
    expect(splitInstallments(90_000, 3)).toEqual([30_000, 30_000, 30_000]);
  });

  it('o resto dos centavos vai na PRIMEIRA parcela: R$ 100 em 3x = 33,34 + 33,33 + 33,33', () => {
    expect(splitInstallments(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
  });

  it('1 parcela é o valor inteiro', () => {
    expect(splitInstallments(12_345, 1)).toEqual([12_345]);
  });

  it('propriedade: soma = total, primeira ≥ demais, diferença máxima de N-1 centavos', () => {
    const random = prng(2026);
    for (let i = 0; i < 500; i++) {
      const count = 1 + Math.floor(random() * 48);
      const total = count + Math.floor(random() * 5_000_000);

      const parts = splitInstallments(total, count);

      expect(parts).toHaveLength(count);
      expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
      expect(parts.every((part) => Number.isInteger(part) && part > 0)).toBe(true);
      expect(parts[0]).toBeGreaterThanOrEqual(Math.max(...parts));
      expect(Math.max(...parts) - Math.min(...parts)).toBeLessThan(count);
    }
  });

  it('rejeita valores inválidos', () => {
    expect(() => splitInstallments(0, 3)).toThrow(RangeError);
    expect(() => splitInstallments(10.5, 3)).toThrow(RangeError);
    expect(() => splitInstallments(100, 0)).toThrow(RangeError);
    expect(() => splitInstallments(2, 3)).toThrow(RangeError); // parcela de zero centavo
  });
});

describe('período da fatura', () => {
  const cycle = { closingDay: 5, dueDay: 15 };

  it('compra até o dia do fechamento (inclusive) entra na fatura que fecha no mês', () => {
    expect(invoicePeriodForPurchase(cycle, '2026-09-03')).toEqual({
      closingDate: '2026-09-05',
      dueDate: '2026-09-15',
      referenceMonth: '2026-09-01',
    });
    expect(invoicePeriodForPurchase(cycle, '2026-09-05').closingDate).toBe('2026-09-05');
  });

  it('compra depois do fechamento entra na fatura do mês seguinte', () => {
    expect(invoicePeriodForPurchase(cycle, '2026-09-06')).toEqual({
      closingDate: '2026-10-05',
      dueDate: '2026-10-15',
      referenceMonth: '2026-10-01',
    });
  });

  it('vencimento em dia menor que o fechamento cai no mês seguinte ao fechamento', () => {
    const late = { closingDay: 25, dueDay: 5 };

    expect(invoicePeriodForPurchase(late, '2026-09-10')).toEqual({
      closingDate: '2026-09-25',
      dueDate: '2026-10-05',
      referenceMonth: '2026-10-01',
    });
    expect(invoicePeriodForPurchase(late, '2026-12-28')).toEqual({
      closingDate: '2027-01-25',
      dueDate: '2027-02-05',
      referenceMonth: '2027-02-01',
    });
  });

  it('meses curtos usam o último dia (fechamento 31 em fevereiro)', () => {
    const end = { closingDay: 31, dueDay: 10 };

    expect(invoicePeriodForPurchase(end, '2026-02-10').closingDate).toBe('2026-02-28');
    expect(invoicePeriodForPurchase(end, '2028-02-29').closingDate).toBe('2028-02-29');
    expect(invoicePeriodForPurchase(end, '2026-04-30').closingDate).toBe('2026-04-30');
    expect(invoicePeriodClosingIn(end, { year: 2026, month: 1 }).dueDate).toBe('2026-02-10');
  });

  it('virada de ano', () => {
    expect(invoicePeriodForPurchase(cycle, '2026-12-20')).toEqual({
      closingDate: '2027-01-05',
      dueDate: '2027-01-15',
      referenceMonth: '2027-01-01',
    });
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
  });

  it('R$ 900 em 3x: uma fatura por mês, a partir da fatura da compra', () => {
    const periods = installmentPeriods(cycle, '2026-09-20', 3);

    expect(periods.map((period) => period.referenceMonth)).toEqual([
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
    ]);
    expect(periods.map((period) => period.dueDate)).toEqual([
      '2026-10-15',
      '2026-11-15',
      '2026-12-15',
    ]);
  });

  it('oráculo dia a dia: cada data pertence a exatamente uma fatura, em ordem, sem lacunas', () => {
    const random = prng(77);
    for (let round = 0; round < 60; round++) {
      const cycleRandom = {
        closingDay: 1 + Math.floor(random() * 31),
        dueDay: 1 + Math.floor(random() * 31),
      };
      let previous: ReturnType<typeof invoicePeriodForPurchase> | undefined;

      // Percorre 3 anos dia a dia (inclui 2028, bissexto).
      for (let time = Date.UTC(2027, 0, 1); time < Date.UTC(2030, 0, 1); time += 86_400_000) {
        const date = ymd(new Date(time));
        const period = invoicePeriodForPurchase(cycleRandom, date);

        // Fechamento: nunca antes da compra, e no máximo ~1 mês depois.
        expect(period.closingDate >= date).toBe(true);
        expect(period.dueDate >= period.closingDate).toBe(true);
        expect(period.referenceMonth).toBe(`${period.dueDate.slice(0, 7)}-01`);
        // Meses de referência nunca voltam no tempo e avançam no máximo 1 mês por dia.
        if (previous) {
          expect(period.closingDate >= previous.closingDate).toBe(true);
          expect(period.referenceMonth >= previous.referenceMonth).toBe(true);
        }
        // O dia do fechamento pertence à fatura que fecha nele; o dia seguinte, à próxima.
        if (date === period.closingDate) {
          const next = invoicePeriodForPurchase(cycleRandom, ymd(new Date(time + 86_400_000)));
          expect(next.closingDate > period.closingDate).toBe(true);
          expect(next.referenceMonth > period.referenceMonth).toBe(true);
        }
        previous = period;
      }
    }
  });

  it('fechamentos consecutivos têm sempre meses de vencimento distintos (fatura única por mês)', () => {
    for (let closingDay = 1; closingDay <= 31; closingDay++) {
      for (let dueDay = 1; dueDay <= 31; dueDay++) {
        const seen = new Set<string>();
        for (let index = 0; index < 48; index++) {
          const { referenceMonth } = invoicePeriodClosingIn(
            { closingDay, dueDay },
            addMonths({ year: 2026, month: 1 }, index),
          );
          expect(seen.has(referenceMonth)).toBe(false);
          seen.add(referenceMonth);
        }
      }
    }
  });

  it('closingMonthOf e daysInMonth', () => {
    expect(closingMonthOf(cycle, '2026-09-05')).toEqual({ year: 2026, month: 9 });
    expect(closingMonthOf(cycle, '2026-09-06')).toEqual({ year: 2026, month: 10 });
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});

describe('status da fatura', () => {
  const invoice = {
    closingDate: '2026-09-05',
    dueDate: '2026-09-15',
    totalCents: 90_000,
    paidCents: 0,
    scheduledCents: 0,
  };

  it('aberta até o dia do fechamento (inclusive)', () => {
    expect(invoiceState(invoice, '2026-09-01').status).toBe('open');
    expect(invoiceState(invoice, '2026-09-05').status).toBe('open');
  });

  it('fechada com valor em aberto; vencida depois do vencimento', () => {
    expect(invoiceState(invoice, '2026-09-06')).toEqual({
      status: 'closed',
      overdue: false,
      remainingCents: 90_000,
    });
    expect(invoiceState(invoice, '2026-09-15').overdue).toBe(false);
    expect(invoiceState(invoice, '2026-09-16')).toMatchObject({ status: 'closed', overdue: true });
  });

  it('paga: nada em aberto depois do fechamento; pagamento parcial continua fechada', () => {
    expect(invoiceState({ ...invoice, paidCents: 90_000 }, '2026-09-20')).toEqual({
      status: 'paid',
      overdue: false,
      remainingCents: 0,
    });
    expect(invoiceState({ ...invoice, paidCents: 40_000 }, '2026-09-20')).toMatchObject({
      status: 'closed',
      remainingCents: 50_000,
    });
  });

  it('crédito (estorno depois de pago) fica negativo e não conta como vencida', () => {
    const state = invoiceState({ ...invoice, totalCents: 60_000, paidCents: 90_000 }, '2026-09-20');

    expect(state).toEqual({ status: 'paid', overdue: false, remainingCents: -30_000 });
  });

  it('pagamento antecipado de fatura aberta não a fecha', () => {
    expect(invoiceState({ ...invoice, paidCents: 90_000 }, '2026-09-02')).toMatchObject({
      status: 'open',
      remainingCents: 0,
    });
  });

  it('valor a pagar desconta o já agendado e nunca é negativo', () => {
    expect(payableCents({ ...invoice, paidCents: 20_000, scheduledCents: 30_000 })).toBe(40_000);
    expect(payableCents({ ...invoice, paidCents: 90_000 })).toBe(0);
    expect(payableCents({ ...invoice, totalCents: 10_000, paidCents: 50_000 })).toBe(0);
  });
});
