import { createHash } from 'node:crypto';

const MAX_LENGTH = 300;

/**
 * Descrição normalizada: MAIÚSCULAS, sem acentos, só letras e dígitos separados por um espaço.
 * É a base de regras de comerciante, similaridade e impressão digital (fingerprint) — por isso
 * "Pix Enviado – José" e "PIX ENVIADO JOSE" são a mesma coisa.
 */
export function normalizeDescription(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .slice(0, MAX_LENGTH)
    .trim();
}

/** Palavras (tokens) da descrição normalizada. */
export function tokens(normalized: string): string[] {
  return normalized === '' ? [] : normalized.split(' ');
}

/** Similaridade de Jaccard entre dois textos normalizados (0 a 1). */
export function similarity(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 && right.size === 0) return 1;
  let common = 0;
  for (const token of left) if (right.has(token)) common++;
  return common / (left.size + right.size - common);
}

export interface FingerprintInput {
  date: string;
  signedCents: number;
  normalized: string;
}

/**
 * Impressão digital de cada linha: conta + data + valor com sinal + descrição normalizada, mais um
 * ORDINAL entre linhas idênticas do mesmo arquivo (dois cafés de R$ 5 no mesmo dia não são a mesma
 * movimentação). Reimportar o mesmo arquivo gera as mesmas impressões — duplicata exata.
 */
export function fingerprints(accountId: string, rows: readonly FingerprintInput[]): string[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const key = `${accountId}|${row.date}|${row.signedCents}|${row.normalized}`;
    const ordinal = (seen.get(key) ?? 0) + 1;
    seen.set(key, ordinal);
    return createHash('sha256').update(`${key}|${ordinal}`).digest('hex');
  });
}
