import { describe, expect, it } from 'vitest';
import { monthsBack, percentOf, shiftMonth } from './reports.service.js';

describe('percentOf', () => {
  it('percentual inteiro arredondado; 0 quando o total é zero', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(50, 0)).toBe(0);
  });
});

describe('shiftMonth', () => {
  it('soma e subtrai meses, inclusive virada de ano', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-09', 0)).toBe('2026-09');
    expect(shiftMonth('2026-09', -15)).toBe('2025-06');
  });
});

describe('monthsBack', () => {
  it('os N meses terminando em `until`, do mais antigo ao mais recente', () => {
    expect(monthsBack('2026-09', 3)).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(monthsBack('2026-01', 2)).toEqual(['2025-12', '2026-01']);
    expect(monthsBack('2026-09', 1)).toEqual(['2026-09']);
  });
});
