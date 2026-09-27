import { z } from 'zod';

/**
 * Dinheiro no FINTRACK é SEMPRE representado em centavos inteiros (ADR 0001).
 * - PostgreSQL: bigint
 * - TypeScript: number inteiro (seguro até Number.MAX_SAFE_INTEGER ≈ 90 trilhões de reais)
 * - Kotlin: Long
 * Nunca usar float para armazenar ou somar valores monetários.
 */

export type Cents = number;

export const MAX_CENTS = Number.MAX_SAFE_INTEGER;

/** Valor monetário não negativo em centavos. O sinal é dado pelo tipo da movimentação. */
export const centsSchema = z.number().int().nonnegative().max(MAX_CENTS);

export function isCents(value: unknown): value is Cents {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function assertCents(value: unknown): asserts value is Cents {
  if (!isCents(value)) {
    throw new TypeError(
      `Valor monetário inválido: esperado inteiro em centavos, recebido ${String(value)}`,
    );
  }
}

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formata centavos como moeda brasileira. Ex.: 9099 → "R$ 90,99". Uso apenas visual. */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return brlFormatter.format(cents / 100);
}

const MONEY_INPUT = /^(-)?(?:R\$)?\s*([\d.,\s]+)$/i;

/**
 * Converte texto digitado pelo usuário em centavos, sem aritmética de ponto flutuante.
 *
 * Regras:
 * - Com vírgula: vírgula é o separador decimal e pontos são milhar ("1.234,56").
 * - Sem vírgula: um ponto seguido de 1 ou 2 dígitos no final é decimal ("90.99");
 *   caso contrário pontos são milhar ("1.234").
 * - Aceita prefixo "R$" e sinal negativo.
 *
 * @throws {RangeError} quando o texto não representa um valor válido.
 */
export function parseBRLToCents(input: string): Cents {
  const match = MONEY_INPUT.exec(input.trim());
  if (!match) throw new RangeError(`Valor monetário inválido: "${input}"`);

  const negative = match[1] === '-';
  const body = (match[2] ?? '').replace(/\s/g, '');

  let integerPart: string;
  let fractionPart: string;

  if (body.includes(',')) {
    const parts = body.split(',');
    if (parts.length !== 2) throw new RangeError(`Valor monetário inválido: "${input}"`);
    integerPart = (parts[0] ?? '').replace(/\./g, '');
    fractionPart = parts[1] ?? '';
  } else {
    const decimalDot = /^(.*)\.(\d{1,2})$/.exec(body);
    if (decimalDot && !(decimalDot[1] ?? '').includes('.')) {
      integerPart = decimalDot[1] ?? '';
      fractionPart = decimalDot[2] ?? '';
    } else {
      integerPart = body.replace(/\./g, '');
      fractionPart = '';
    }
  }

  if (integerPart === '') integerPart = '0';
  if (!/^\d+$/.test(integerPart) || !/^\d{0,2}$/.test(fractionPart)) {
    throw new RangeError(`Valor monetário inválido: "${input}"`);
  }

  const cents = Number(integerPart) * 100 + Number(fractionPart.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents))
    throw new RangeError(`Valor monetário fora do limite: "${input}"`);

  return negative ? -cents : cents;
}

/** Valor de uma movimentação: inteiro estritamente positivo (o sinal vem do tipo). */
export const positiveCentsSchema = z.number().int().positive().max(MAX_CENTS);

/** Valor que pode ser negativo, como o saldo de uma conta no cheque especial. */
export const signedCentsSchema = z.number().int().min(-MAX_CENTS).max(MAX_CENTS);
