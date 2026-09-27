import { BUDGET_WARNING_PERCENT } from '@fintrack/shared';

export type BudgetStatus = 'ok' | 'warning' | 'exceeded';

export interface BudgetFigures {
  limitCents: number;
  spentCents: number;
  remainingCents: number;
  /** Percentual do limite já gasto, arredondado (pode passar de 100). */
  percentUsed: number;
  status: BudgetStatus;
}

/**
 * Cálculo do orçamento (docs/financial-rules.md §7). O "gasto" nunca é gravado: é a soma das despesas
 * EFETIVADAS da categoria no mês. Transferências, investimentos e cancelados não contam.
 */
export function budgetFigures(limitCents: number, spentCents: number): BudgetFigures {
  // Aritmética inteira: sem ponto flutuante nos valores em centavos (só o percentual é arredondado).
  const percentUsed = limitCents > 0 ? Math.round((spentCents * 100) / limitCents) : 0;
  return {
    limitCents,
    spentCents,
    remainingCents: limitCents - spentCents,
    percentUsed,
    status:
      spentCents > limitCents
        ? 'exceeded'
        : percentUsed >= BUDGET_WARNING_PERCENT
          ? 'warning'
          : 'ok',
  };
}

/** "2026-09" → primeiro e último dia do mês ("2026-09-01", "2026-09-30"). */
export function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}
