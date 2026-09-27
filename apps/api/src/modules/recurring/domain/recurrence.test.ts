import { describe, expect, it } from 'vitest';
import {
  isOccurrence,
  nextOccurrence,
  occurrencesBetween,
  type RecurrenceRule,
} from './recurrence.js';

const monthly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: 'monthly',
  interval: 1,
  dayOfMonth: 5,
  startDate: '2026-01-01',
  endDate: null,
  ...over,
});

describe('mensal', () => {
  it('exemplo do enunciado: Vivo, dia 5 — uma ocorrência por mês', () => {
    expect(occurrencesBetween(monthly(), '2026-09-01', '2026-12-31')).toEqual([
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
    ]);
  });

  it('a janela é inclusiva nas duas pontas', () => {
    expect(occurrencesBetween(monthly(), '2026-09-05', '2026-10-05')).toEqual([
      '2026-09-05',
      '2026-10-05',
    ]);
    expect(occurrencesBetween(monthly(), '2026-09-06', '2026-10-04')).toEqual([]);
  });

  it('dia 31 usa o último dia dos meses curtos (inclusive fevereiro bissexto)', () => {
    const rule = monthly({ dayOfMonth: 31 });
    expect(occurrencesBetween(rule, '2026-01-01', '2026-06-30')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
    expect(occurrencesBetween(rule, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });

  it('não gera nada antes da data de início; se o dia já passou no mês de início, começa no seguinte', () => {
    const rule = monthly({ startDate: '2026-09-10', dayOfMonth: 5 });
    expect(occurrencesBetween(rule, '2026-01-01', '2026-11-30')).toEqual([
      '2026-10-05',
      '2026-11-05',
    ]);
  });

  it('respeita a data de fim', () => {
    const rule = monthly({ endDate: '2026-10-04' });
    expect(occurrencesBetween(rule, '2026-09-01', '2026-12-31')).toEqual(['2026-09-05']);
  });

  it('intervalo de 2 meses (bimestral) conta a partir do mês de início', () => {
    const rule = monthly({ interval: 2, startDate: '2026-01-15', dayOfMonth: 15 });
    expect(occurrencesBetween(rule, '2026-01-01', '2026-08-31')).toEqual([
      '2026-01-15',
      '2026-03-15',
      '2026-05-15',
      '2026-07-15',
    ]);
  });

  it('atravessa virada de ano', () => {
    expect(occurrencesBetween(monthly({ dayOfMonth: 20 }), '2026-11-01', '2027-02-28')).toEqual([
      '2026-11-20',
      '2026-12-20',
      '2027-01-20',
      '2027-02-20',
    ]);
  });
});

describe('semanal', () => {
  const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
    frequency: 'weekly',
    interval: 1,
    dayOfMonth: null,
    startDate: '2026-09-07', // segunda-feira
    endDate: null,
    ...over,
  });

  it('todo mesmo dia da semana da data de início', () => {
    expect(occurrencesBetween(weekly(), '2026-09-01', '2026-10-05')).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
    ]);
  });

  it('quinzenal', () => {
    expect(occurrencesBetween(weekly({ interval: 2 }), '2026-09-01', '2026-10-31')).toEqual([
      '2026-09-07',
      '2026-09-21',
      '2026-10-05',
      '2026-10-19',
    ]);
  });
});

describe('anual', () => {
  const yearly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
    frequency: 'yearly',
    interval: 1,
    dayOfMonth: null,
    startDate: '2026-03-15',
    endDate: null,
    ...over,
  });

  it('mesmo dia e mês todo ano', () => {
    expect(occurrencesBetween(yearly(), '2026-01-01', '2028-12-31')).toEqual([
      '2026-03-15',
      '2027-03-15',
      '2028-03-15',
    ]);
  });

  it('29/02 vira 28/02 em ano comum', () => {
    expect(
      occurrencesBetween(yearly({ startDate: '2024-02-29' }), '2024-01-01', '2028-12-31'),
    ).toEqual(['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
  });

  it('a cada 2 anos', () => {
    expect(occurrencesBetween(yearly({ interval: 2 }), '2026-01-01', '2031-12-31')).toEqual([
      '2026-03-15',
      '2028-03-15',
      '2030-03-15',
    ]);
  });
});

describe('utilitários', () => {
  it('janela invertida ou fora do período da regra → vazio', () => {
    expect(occurrencesBetween(monthly(), '2026-10-01', '2026-09-01')).toEqual([]);
    expect(
      occurrencesBetween(monthly({ endDate: '2026-03-01' }), '2026-09-01', '2026-12-31'),
    ).toEqual([]);
  });

  it('isOccurrence e nextOccurrence', () => {
    expect(isOccurrence(monthly(), '2026-09-05')).toBe(true);
    expect(isOccurrence(monthly(), '2026-09-06')).toBe(false);
    expect(nextOccurrence(monthly(), '2026-09-06')).toBe('2026-10-05');
    expect(nextOccurrence(monthly({ endDate: '2026-09-30' }), '2026-09-06')).toBeNull();
  });
});

/**
 * Propriedade: a geração eficiente concorda com um oráculo INDEPENDENTE que testa cada dia do
 * calendário contra a definição da regra (sem reutilizar nenhuma lógica de geração).
 */
describe('propriedade: geração = definição dia a dia', () => {
  const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ymd = (d: Date) => d.toISOString().slice(0, 10);

  function matches(rule: RecurrenceRule, date: string): boolean {
    if (date < rule.startDate || (rule.endDate !== null && date > rule.endDate)) return false;
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const [sy, sm, sd] = rule.startDate.split('-').map(Number) as [number, number, number];
    const day = rule.dayOfMonth ?? sd;
    if (rule.frequency === 'monthly') {
      const months = (y - sy) * 12 + (m - sm);
      return months >= 0 && months % rule.interval === 0 && d === Math.min(day, daysIn(y, m));
    }
    if (rule.frequency === 'yearly') {
      return (
        (y - sy) % rule.interval === 0 && y >= sy && m === sm && d === Math.min(day, daysIn(y, m))
      );
    }
    const diff = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
    return diff >= 0 && diff % (7 * rule.interval) === 0;
  }

  function prng(seed: number) {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it.each(Array.from({ length: 40 }, (_, i) => i + 1))('regra aleatória %i', (seed) => {
    const random = prng(seed * 7919);
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const frequency = (['weekly', 'monthly', 'yearly'] as const)[int(0, 2)]!;
    const startDate = ymd(new Date(Date.UTC(int(2023, 2026), int(0, 11), int(1, 28))));
    const rule: RecurrenceRule = {
      frequency,
      interval: int(1, 4),
      dayOfMonth: frequency === 'weekly' ? null : int(1, 31),
      startDate,
      endDate:
        random() < 0.4 ? ymd(new Date(Date.UTC(int(2026, 2028), int(0, 11), int(1, 28)))) : null,
    };
    const from = ymd(new Date(Date.UTC(int(2024, 2027), int(0, 11), int(1, 28))));
    const to = ymd(new Date(Date.UTC(2027 + int(0, 1), int(0, 11), int(1, 28))));

    const expected: string[] = [];
    for (let t = Date.parse(from); t <= Date.parse(to); t += 86_400_000) {
      const date = ymd(new Date(t));
      if (matches(rule, date)) expected.push(date);
    }

    const generated = occurrencesBetween(rule, from, to);

    expect(generated).toEqual(expected);
    expect(generated).toEqual([...generated].sort());
    for (const date of generated) expect(isOccurrence(rule, date)).toBe(true);
  });
});
