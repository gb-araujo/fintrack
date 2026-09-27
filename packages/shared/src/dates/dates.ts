import { z } from 'zod';

/** Data de calendário sem hora nem fuso: "AAAA-MM-DD". */
export type DateOnly = string;

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: string): boolean {
  const match = DATE_ONLY.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const dateOnlySchema = z
  .string({ error: 'Informe a data.' })
  .refine(isValidDateOnly, { error: 'Data inválida. Use o formato AAAA-MM-DD.' });

/**
 * "Hoje" no fuso do usuário. O servidor roda em UTC, então nunca use a data do servidor para
 * decidir o que é passado ou futuro para o usuário (ADR 0001 / financial-rules.md).
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): DateOnly {
  // O locale en-CA formata como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isFutureDate(date: DateOnly, today: DateOnly): boolean {
  // Datas AAAA-MM-DD comparam corretamente como texto.
  return date > today;
}

/** Soma (ou subtrai) dias de uma data de calendário, sem depender de fuso. */
export function addDaysToDate(date: DateOnly, days: number): DateOnly {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
