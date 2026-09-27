import { describe, expect, it } from 'vitest';
import {
  emailSchema,
  isValidTimeZone,
  loginRequestSchema,
  newPasswordSchema,
  registerRequestSchema,
} from './auth.js';

describe('emailSchema', () => {
  it('normaliza espaços e maiúsculas', () => {
    expect(emailSchema.parse('  Gabriel@Exemplo.COM ')).toBe('gabriel@exemplo.com');
  });

  it('rejeita e-mail inválido', () => {
    expect(emailSchema.safeParse('não-é-email').success).toBe(false);
  });
});

describe('newPasswordSchema', () => {
  it('exige entre 8 e 128 caracteres', () => {
    expect(newPasswordSchema.safeParse('1234567').success).toBe(false);
    expect(newPasswordSchema.safeParse('12345678').success).toBe(true);
    expect(newPasswordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('registerRequestSchema', () => {
  it('aceita cadastro válido com fuso opcional', () => {
    const parsed = registerRequestSchema.parse({
      name: ' Gabriel ',
      email: 'G@EXEMPLO.COM',
      password: 'senha-segura',
      timezone: 'America/Sao_Paulo',
    });
    expect(parsed).toEqual({
      name: 'Gabriel',
      email: 'g@exemplo.com',
      password: 'senha-segura',
      timezone: 'America/Sao_Paulo',
    });
  });

  it('rejeita fuso horário inexistente', () => {
    const result = registerRequestSchema.safeParse({
      name: 'G',
      email: 'g@exemplo.com',
      password: 'senha-segura',
      timezone: 'Marte/Olympus',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginRequestSchema', () => {
  it('não aplica tamanho mínimo de senha no login', () => {
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: '1' }).success).toBe(true);
    expect(loginRequestSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it('valida identificadores IANA', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Nada/Aqui')).toBe(false);
  });
});
