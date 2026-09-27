import { DUPLICATE_WINDOW_DAYS, type DuplicateKind } from '@fintrack/shared';
import { similarity } from './normalize.js';

export interface DedupeRow {
  fingerprint: string;
  date: string;
  /** Valor com sinal (entrada positiva, saída negativa). */
  signedCents: number;
  normalized: string;
}

/** Lançamento que já existe na conta (qualquer origem: manual, recorrência, importação anterior). */
export interface ExistingEntry {
  id: string;
  date: string;
  signedCents: number;
  normalized: string;
}

export interface DuplicateFinding {
  kind: DuplicateKind;
  transactionId: string | null;
}

const MS_PER_DAY = 86_400_000;

function dayNumber(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(year, month - 1, day) / MS_PER_DAY);
}

/**
 * Duplicidade de cada linha do extrato (docs/financial-rules.md §6). NUNCA descarta: só sinaliza.
 *
 * 1. **exata** — a impressão digital já foi importada e confirmada antes (mesmo arquivo, ou período
 *    sobreposto). `prior` mapeia a impressão → lançamento criado (se houver).
 * 2. **possível** — existe um lançamento na conta com o MESMO valor (e sentido) numa janela de
 *    ± `windowDays` dias. Cada lançamento existente é "reivindicado" por NO MÁXIMO uma linha
 *    (dois cafés de R$ 5 e um só lançamento → um possível duplicado e um novo), escolhendo os
 *    pares de menor distância de datas e maior similaridade de descrição.
 */
export function detectDuplicates(
  rows: readonly DedupeRow[],
  prior: ReadonlyMap<string, string | null>,
  existing: readonly ExistingEntry[],
  windowDays: number = DUPLICATE_WINDOW_DAYS,
): (DuplicateFinding | null)[] {
  const findings: (DuplicateFinding | null)[] = rows.map(() => null);
  const claimed = new Set<string>();

  rows.forEach((row, index) => {
    if (!prior.has(row.fingerprint)) return;
    const transactionId = prior.get(row.fingerprint) ?? null;
    findings[index] = { kind: 'exact', transactionId };
    if (transactionId) claimed.add(transactionId);
  });

  const pairs: { row: number; entry: ExistingEntry; distance: number; score: number }[] = [];
  rows.forEach((row, index) => {
    if (findings[index]) return;
    const rowDay = dayNumber(row.date);
    for (const entry of existing) {
      if (claimed.has(entry.id) || entry.signedCents !== row.signedCents) continue;
      const distance = Math.abs(dayNumber(entry.date) - rowDay);
      if (distance > windowDays) continue;
      pairs.push({
        row: index,
        entry,
        distance,
        score: similarity(row.normalized, entry.normalized),
      });
    }
  });
  pairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.score - a.score ||
      a.row - b.row ||
      a.entry.id.localeCompare(b.entry.id),
  );
  for (const pair of pairs) {
    if (findings[pair.row] || claimed.has(pair.entry.id)) continue;
    findings[pair.row] = { kind: 'possible', transactionId: pair.entry.id };
    claimed.add(pair.entry.id);
  }
  return findings;
}
