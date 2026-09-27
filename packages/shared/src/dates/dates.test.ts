import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  dateOnlySchema,
  isFutureDate,
  isValidDateOnly,
  todayInTimeZone,
} from './dates.js';

describe('isValidDateOnly', () => {
  it.each(['2026-09-27', '2024-02-29', '2026-12-31'])('aceita %s', (value) => {
    expect(isValidDateOnly(value)).toBe(true);
  });

  it.each(['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '26-09-27', '2026-9-27', ''])(
    'rejeita "%s"',
    (value) => {
      expect(isValidDateOnly(value)).toBe(false);
    },
  );

  it('schema devolve mensagem em português', () => {
    const result = dateOnlySchema.safeParse('2026-02-30');
    expect(result.success).toBe(false);
  });
});

describe('todayInTimeZone', () => {
  it('usa o fuso do usuário, não o do servidor (UTC)', () => {
    // 02:00 UTC de 27/09 ainda é 26/09 em São Paulo (UTC-3) e já é 27/09 em Tóquio.
    const instant = new Date('2026-09-27T02:00:00Z');
    expect(todayInTimeZone('America/Sao_Paulo', instant)).toBe('2026-09-26');
    expect(todayInTimeZone('Asia/Tokyo', instant)).toBe('2026-09-27');
    expect(todayInTimeZone('UTC', instant)).toBe('2026-09-27');
  });

  it('vira o dia à meia-noite local', () => {
    expect(todayInTimeZone('America/Sao_Paulo', new Date('2026-09-27T02:59:59Z'))).toBe(
      '2026-09-26',
    );
    expect(todayInTimeZone('America/Sao_Paulo', new Date('2026-09-27T03:00:00Z'))).toBe(
      '2026-09-27',
    );
  });
});

describe('isFutureDate', () => {
  it('compara datas como texto', () => {
    expect(isFutureDate('2026-09-28', '2026-09-27')).toBe(true);
    expect(isFutureDate('2026-09-27', '2026-09-27')).toBe(false);
    expect(isFutureDate('2026-09-26', '2026-09-27')).toBe(false);
    expect(isFutureDate('2027-01-01', '2026-12-31')).toBe(true);
  });
});

describe('addDaysToDate', () => {
  it('atravessa meses e anos', () => {
    expect(addDaysToDate('2026-09-27', 5)).toBe('2026-10-02');
    expect(addDaysToDate('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDaysToDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToDate('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDaysToDate('2026-09-27', 0)).toBe('2026-09-27');
  });
});
