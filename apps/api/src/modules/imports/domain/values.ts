/**
 * Conversão de valores de extratos: dinheiro (centavos inteiros, sem ponto flutuante) e datas.
 * Funções PURAS. Devolvem `null` quando não conseguem interpretar com segurança — quem chama
 * registra a linha como ignorada (nada é descartado em silêncio).
 */

const MAX_CENTS = Number.MAX_SAFE_INTEGER;

/**
 * "1.234,56", "-R$ 1.234,56", "1234.56", "(45,90)", "45,90-", "1,234.56" → centavos COM sinal.
 * Regras do separador decimal: com vírgula e ponto, vale o ÚLTIMO; só vírgula → decimal; só ponto →
 * decimal se tiver 1–2 dígitos depois, milhar se tiver 3 ("1.234" = 1234,00).
 */
export function parseAmountToCents(input: string): number | null {
  let text = input
    .replace(/\u00a0/g, ' ')
    .replace(/R\$/gi, '')
    .trim();
  if (text === '') return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1).trim();
  }
  text = text.replace(/−/g, '-');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1).trim();
  } else if (text.startsWith('+')) {
    text = text.slice(1).trim();
  }
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1).trim();
  }
  text = text.replace(/\s+/g, '');
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let integerPart: string;
  let fractionPart = '';

  if (lastComma >= 0 && lastDot >= 0) {
    const decimalIndex = Math.max(lastComma, lastDot);
    const thousands = lastComma > lastDot ? '.' : ',';
    integerPart = text.slice(0, decimalIndex).split(thousands).join('');
    fractionPart = text.slice(decimalIndex + 1);
    if (integerPart.includes(',') || integerPart.includes('.')) return null;
  } else if (lastComma >= 0) {
    const parts = text.split(',');
    if (parts.length === 2) {
      integerPart = parts[0] as string;
      fractionPart = parts[1] as string;
    } else if (parts.slice(1).every((part) => part.length === 3)) {
      integerPart = parts.join(''); // "1,234,567": vírgula como milhar
    } else {
      return null;
    }
  } else if (lastDot >= 0) {
    const parts = text.split('.');
    const last = parts[parts.length - 1] as string;
    if (parts.length === 2 && last.length >= 1 && last.length <= 2) {
      integerPart = parts[0] as string;
      fractionPart = last;
    } else if (parts.slice(1).every((part) => part.length === 3)) {
      integerPart = parts.join(''); // "1.234" ou "1.234.567": ponto como milhar
    } else {
      return null;
    }
  } else {
    integerPart = text;
  }

  if (integerPart === '') integerPart = '0';
  if (!/^\d+$/.test(integerPart) || (fractionPart !== '' && !/^\d{1,2}$/.test(fractionPart))) {
    return null;
  }
  const reais = Number(integerPart);
  if (!Number.isSafeInteger(reais) || reais > MAX_CENTS / 100 - 1) return null;
  const cents = reais * 100 + Number(fractionPart.padEnd(2, '0'));
  return negative ? -cents : cents;
}

function isRealDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

/**
 * "27/09/2026", "27-09-26", "27.09.2026", "2026-09-27", "2026/09/27", com hora opcional
 * ("27/09/2026 10:32", "2026-09-27T10:32:00") → "AAAA-MM-DD". Dia/mês na ordem brasileira.
 */
export function parseStatementDate(input: string): string | null {
  const token = input.trim().split(/[\sT]/)[0] ?? '';
  let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(token);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
    return isRealDate(year, month, day) ? `${pad(year, 4)}-${pad(month)}-${pad(day)}` : null;
  }
  match = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(token);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = match[3]!.length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return isRealDate(year, month, day) ? `${pad(year, 4)}-${pad(month)}-${pad(day)}` : null;
  }
  return null;
}
