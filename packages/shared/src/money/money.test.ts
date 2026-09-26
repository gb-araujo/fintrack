import { describe, expect, it } from 'vitest';
import { assertCents, centsSchema, formatBRL, isCents, parseBRLToCents } from './money.js';

const NBSP = ' ';

describe('formatBRL', () => {
  it('formata centavos em reais no padrão brasileiro', () => {
    expect(formatBRL(9099)).toBe(`R$${NBSP}90,99`);
    expect(formatBRL(250000)).toBe(`R$${NBSP}2.500,00`);
    expect(formatBRL(0)).toBe(`R$${NBSP}0,00`);
    expect(formatBRL(1)).toBe(`R$${NBSP}0,01`);
  });

  it('rejeita valores que não são centavos inteiros', () => {
    expect(() => formatBRL(10.5)).toThrow(TypeError);
    expect(() => formatBRL(Number.NaN)).toThrow(TypeError);
  });
});

describe('parseBRLToCents', () => {
  it.each([
    ['90,99', 9099],
    ['R$ 90,99', 9099],
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['90.99', 9099],
    ['1.234', 123400],
    ['1.234.567', 123456700],
    ['900', 90000],
    [',5', 50],
    ['-76,99', -7699],
  ])('"%s" → %i centavos', (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it('não sofre erro de ponto flutuante', () => {
    // 0.29 * 100 === 28.999999999999996 em float
    expect(parseBRLToCents('0,29')).toBe(29);
    expect(parseBRLToCents('1,15')).toBe(115);
  });

  it.each(['', 'abc', '1,2,3', '10,999', '1.2.3,4.5', 'R$'])('rejeita "%s"', (input) => {
    expect(() => parseBRLToCents(input)).toThrow(RangeError);
  });
});

describe('isCents / assertCents / centsSchema', () => {
  it('aceita apenas inteiros seguros', () => {
    expect(isCents(100)).toBe(true);
    expect(isCents(1.5)).toBe(false);
    expect(isCents('100')).toBe(false);
    expect(isCents(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(() => assertCents(0.1)).toThrow(TypeError);
  });

  it('centsSchema não aceita negativos nem frações', () => {
    expect(centsSchema.safeParse(9099).success).toBe(true);
    expect(centsSchema.safeParse(-1).success).toBe(false);
    expect(centsSchema.safeParse(1.5).success).toBe(false);
  });
});
