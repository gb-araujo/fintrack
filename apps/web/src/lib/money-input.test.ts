import { describe, expect, it } from 'vitest';
import { centsToInput, parseMoneyInput } from './money-input';

describe('parseMoneyInput', () => {
  it('converte texto em centavos sem erro de ponto flutuante', () => {
    expect(parseMoneyInput('90,99')).toEqual({ ok: true, cents: 9099 });
    expect(parseMoneyInput('R$ 1.234,56')).toEqual({ ok: true, cents: 123456 });
    expect(parseMoneyInput('0,29')).toEqual({ ok: true, cents: 29 });
  });

  it('exige valor', () => {
    expect(parseMoneyInput('  ')).toEqual({ ok: false, error: 'Informe o valor.' });
  });

  it('rejeita texto inválido, zero e negativo por padrão', () => {
    expect(parseMoneyInput('abc')).toMatchObject({ ok: false });
    expect(parseMoneyInput('0')).toEqual({ ok: false, error: 'O valor deve ser maior que zero.' });
    expect(parseMoneyInput('-5')).toEqual({ ok: false, error: 'O valor deve ser positivo.' });
  });

  it('saldo inicial pode ser zero ou negativo', () => {
    expect(parseMoneyInput('0', { allowZero: true, allowNegative: true })).toEqual({
      ok: true,
      cents: 0,
    });
    expect(parseMoneyInput('-150,00', { allowZero: true, allowNegative: true })).toEqual({
      ok: true,
      cents: -15000,
    });
  });
});

describe('centsToInput', () => {
  it('formata para edição e volta ao mesmo valor', () => {
    for (const cents of [0, 5, 99, 9099, 123456, 100000000, -15000]) {
      const text = centsToInput(cents);
      expect(parseMoneyInput(text, { allowNegative: true, allowZero: true })).toEqual({
        ok: true,
        cents,
      });
    }
    expect(centsToInput(123456)).toBe('1.234,56');
    expect(centsToInput(5)).toBe('0,05');
  });
});
