/**
 * Fatura do cartão: a qual fatura uma compra pertence e quando ela fecha e vence (ADR 0005/0017).
 * Funções PURAS sobre datas de calendário "AAAA-MM-DD" (sem hora nem fuso).
 *
 * Regras:
 * - O fechamento do mês é o dia `closingDay` (meses curtos usam o último dia).
 * - Compra até o dia do fechamento (inclusive) entra na fatura que fecha naquele mês; depois disso,
 *   na fatura do mês seguinte.
 * - O vencimento fica no mesmo mês do fechamento se `dueDay > closingDay` (dias CONFIGURADOS);
 *   senão, no mês seguinte. Meses curtos usam o último dia. Assim cada fechamento tem um vencimento
 *   em um mês diferente dos demais (a fatura é única por cartão + mês do vencimento).
 * - `referenceMonth` = mês do VENCIMENTO: é nele que as parcelas são reconhecidas como despesa.
 */
export interface CardCycle {
  closingDay: number;
  dueDay: number;
}

export interface InvoicePeriod {
  closingDate: string;
  dueDate: string;
  /** Primeiro dia do mês do vencimento ("AAAA-MM-01"). */
  referenceMonth: string;
}

interface YearMonth {
  year: number;
  month: number;
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Dia `day` do mês, limitado ao último dia (dia 31 em fevereiro → 28/29). */
function clampedDate({ year, month }: YearMonth, day: number): string {
  return `${pad(year, 4)}-${pad(month)}-${pad(Math.min(day, daysInMonth(year, month)))}`;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function parseYearMonth(date: string): YearMonth {
  const [year, month] = date.split('-').map(Number) as [number, number];
  return { year, month };
}

/** Mês em que fecha a fatura que recebe uma compra feita em `purchaseDate`. */
export function closingMonthOf(cycle: CardCycle, purchaseDate: string): YearMonth {
  const purchaseMonth = parseYearMonth(purchaseDate);
  return purchaseDate <= clampedDate(purchaseMonth, cycle.closingDay)
    ? purchaseMonth
    : addMonths(purchaseMonth, 1);
}

/** Período da fatura que FECHA no mês informado. */
export function invoicePeriodClosingIn(cycle: CardCycle, closingMonth: YearMonth): InvoicePeriod {
  const dueMonth = cycle.dueDay > cycle.closingDay ? closingMonth : addMonths(closingMonth, 1);
  return {
    closingDate: clampedDate(closingMonth, cycle.closingDay),
    dueDate: clampedDate(dueMonth, cycle.dueDay),
    referenceMonth: `${pad(dueMonth.year, 4)}-${pad(dueMonth.month)}-01`,
  };
}

/** Período da fatura que recebe uma compra feita em `purchaseDate`. */
export function invoicePeriodForPurchase(cycle: CardCycle, purchaseDate: string): InvoicePeriod {
  return invoicePeriodClosingIn(cycle, closingMonthOf(cycle, purchaseDate));
}

/**
 * Fatura de cada parcela: a 1ª cai na fatura da compra e as seguintes, uma fatura por mês depois
 * (R$ 900 em 3x comprados em setembro → faturas de setembro/outubro/novembro do cartão).
 */
export function installmentPeriods(
  cycle: CardCycle,
  purchaseDate: string,
  count: number,
): InvoicePeriod[] {
  const first = closingMonthOf(cycle, purchaseDate);
  return Array.from({ length: count }, (_, index) =>
    invoicePeriodClosingIn(cycle, addMonths(first, index)),
  );
}
