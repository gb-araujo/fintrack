import type { RecurrenceFrequency } from '@fintrack/shared';

/**
 * Geração de ocorrências de recorrências (ADR 0008). Funções PURAS sobre datas de calendário
 * "AAAA-MM-DD" (sem hora nem fuso): o resultado não depende do relógio nem do servidor.
 *
 * - mensal:  todo `interval`-ésimo mês (contado a partir do mês de início), no `dayOfMonth`;
 *            meses mais curtos usam o último dia (dia 31 em fevereiro → 28/29).
 * - semanal: a cada `interval` semanas, no mesmo dia da semana da data de início.
 * - anual:   a cada `interval` anos, no mesmo mês da data de início (29/02 → 28/02 em ano comum).
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  /** Obrigatório no mensal; no anual, padrão = dia da data de início. */
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
}

const MS_PER_DAY = 86_400_000;
/** Proteção contra janelas absurdas: nenhuma consulta legítima passa disso. */
export const MAX_OCCURRENCES = 1_000;

function parse(date: string): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return [year, month, day];
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dayNumber(date: string): number {
  const [year, month, day] = parse(date);
  return Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

function fromDayNumber(days: number): string {
  return new Date(days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Datas (ordenadas, sem repetição) em que a regra ocorre dentro de [from, to], inclusive. */
export function occurrencesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  const lower = from > rule.startDate ? from : rule.startDate;
  const upper = rule.endDate !== null && rule.endDate < to ? rule.endDate : to;
  if (lower > upper) return [];

  const dates: string[] = [];
  const push = (date: string) => {
    if (date >= lower && date <= upper) dates.push(date);
  };
  const [startYear, startMonth, startDay] = parse(rule.startDate);
  const interval = Math.max(1, rule.interval);

  if (rule.frequency === 'weekly') {
    const step = 7 * interval;
    const start = dayNumber(rule.startDate);
    const offset = Math.max(0, dayNumber(lower) - start);
    for (let day = start + Math.ceil(offset / step) * step; day <= dayNumber(upper); day += step) {
      push(fromDayNumber(day));
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  const [lowerYear, lowerMonth] = parse(lower);
  const [upperYear, upperMonth] = parse(upper);

  if (rule.frequency === 'monthly') {
    const day = rule.dayOfMonth ?? startDay;
    const monthsToLower = (lowerYear - startYear) * 12 + (lowerMonth - startMonth);
    const monthsToUpper = (upperYear - startYear) * 12 + (upperMonth - startMonth);
    for (
      let k = Math.max(0, Math.floor(monthsToLower / interval) - 1);
      k * interval <= monthsToUpper + interval;
      k++
    ) {
      const index = startMonth - 1 + k * interval;
      const year = startYear + Math.floor(index / 12);
      const month = (index % 12) + 1;
      push(format(year, month, Math.min(day, daysInMonth(year, month))));
      if (dates.length >= MAX_OCCURRENCES) break;
    }
    return dates;
  }

  // yearly
  const day = rule.dayOfMonth ?? startDay;
  for (
    let k = Math.max(0, Math.floor((lowerYear - startYear) / interval) - 1);
    startYear + k * interval <= upperYear + interval;
    k++
  ) {
    const year = startYear + k * interval;
    push(format(year, startMonth, Math.min(day, daysInMonth(year, startMonth))));
    if (dates.length >= MAX_OCCURRENCES) break;
  }
  return dates;
}

/** A data é uma ocorrência válida da regra? */
export function isOccurrence(rule: RecurrenceRule, date: string): boolean {
  return occurrencesBetween(rule, date, date).length === 1;
}

/** Primeira ocorrência a partir de `from` (inclusive), procurando até `horizonDays` dias. */
export function nextOccurrence(
  rule: RecurrenceRule,
  from: string,
  horizonDays = 800,
): string | null {
  const to = fromDayNumber(dayNumber(from) + horizonDays);
  return occurrencesBetween(rule, from, to)[0] ?? null;
}
