import { parseBRLToCents } from '@fintrack/shared';

export type MoneyParse = { ok: true; cents: number } | { ok: false; error: string };

/**
 * Converte o texto digitado em centavos inteiros, com mensagem em português para o usuário.
 * `allowNegative`: só para saldo inicial de conta (cheque especial). `allowZero`: saldo inicial.
 */
export function parseMoneyInput(
  text: string,
  {
    allowNegative = false,
    allowZero = false,
  }: { allowNegative?: boolean; allowZero?: boolean } = {},
): MoneyParse {
  if (text.trim() === '') return { ok: false, error: 'Informe o valor.' };
  let cents: number;
  try {
    cents = parseBRLToCents(text);
  } catch {
    return { ok: false, error: 'Valor inválido. Use o formato 1.234,56.' };
  }
  if (cents < 0 && !allowNegative) return { ok: false, error: 'O valor deve ser positivo.' };
  if (cents === 0 && !allowZero) return { ok: false, error: 'O valor deve ser maior que zero.' };
  return { ok: true, cents };
}

/** Centavos → texto editável ("1.234,56"), para preencher formulários de edição. */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const reais = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${reais},${String(abs % 100).padStart(2, '0')}`;
}
