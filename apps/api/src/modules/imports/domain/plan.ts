import type { ImportDecision, ImportRowType } from '@fintrack/shared';
import { tokens } from './normalize.js';

export interface PlannableRow {
  id: string;
  direction: 'in' | 'out';
  description: string;
  normalizedDescription: string;
  suggestedType: ImportRowType;
  suggestedCategoryId: string | null;
  suggestedTargetAccountId: string | null;
  suggestedInvoiceId: string | null;
  defaultAction: 'import' | 'skip';
}

export type PlannedRow =
  | { action: 'skip'; rowId: string }
  | {
      action: 'import';
      rowId: string;
      type: ImportRowType;
      categoryId: string | null;
      targetAccountId: string | null;
      invoiceId: string | null;
      description: string;
      saveRule: boolean;
    };

/** A decisão do usuário não faz sentido para esta linha (mensagem em português). */
export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanError';
  }
}

/**
 * Decide o que fazer com uma linha na confirmação: a decisão do usuário, ou o padrão sugerido.
 * Valida coerência (receita só entra, despesa só sai; transferência precisa de outra conta;
 * pagamento de fatura precisa da fatura). Uma sugestão de categoria/conta só é reaproveitada se o
 * usuário NÃO trocou o tipo (a sugestão pertence ao tipo sugerido).
 */
export function planRow(
  row: PlannableRow,
  decision: ImportDecision | undefined,
  importAccountId: string,
): PlannedRow {
  const action = decision?.action ?? row.defaultAction;
  if (action === 'skip') return { action: 'skip', rowId: row.id };

  const type = decision?.type ?? row.suggestedType;
  const sameType = type === row.suggestedType;

  if (type === 'income' && row.direction !== 'in') {
    throw new PlanError('é uma saída de dinheiro, então não pode ser uma receita.');
  }
  if (type === 'expense' && row.direction !== 'out') {
    throw new PlanError('é uma entrada de dinheiro, então não pode ser uma despesa.');
  }
  if (type === 'card_payment' && row.direction !== 'out') {
    throw new PlanError('é uma entrada de dinheiro, então não pode ser um pagamento de fatura.');
  }

  let categoryId: string | null = null;
  if (type === 'income' || type === 'expense') {
    categoryId =
      decision?.categoryId !== undefined
        ? decision.categoryId
        : sameType
          ? row.suggestedCategoryId
          : null;
  } else if (decision?.categoryId) {
    throw new PlanError('transferências e pagamentos de fatura não têm categoria.');
  }

  let targetAccountId: string | null = null;
  if (type === 'transfer') {
    targetAccountId = decision?.targetAccountId ?? (sameType ? row.suggestedTargetAccountId : null);
    if (!targetAccountId) throw new PlanError('escolha a outra conta da transferência.');
    if (targetAccountId === importAccountId) {
      throw new PlanError('a conta de destino deve ser diferente da conta do extrato.');
    }
  }

  let invoiceId: string | null = null;
  if (type === 'card_payment') {
    invoiceId = decision?.invoiceId ?? (sameType ? row.suggestedInvoiceId : null);
    if (!invoiceId) throw new PlanError('escolha a fatura que este pagamento quita.');
  }

  const description = (decision?.description?.trim() || row.description).slice(0, 200);
  return {
    action: 'import',
    rowId: row.id,
    type,
    categoryId,
    targetAccountId,
    invoiceId,
    description,
    saveRule: decision?.saveRule === true && type !== 'card_payment',
  };
}

/**
 * Texto da regra a salvar a partir de uma descrição normalizada: sem números soltos (datas, ids,
 * parcelas) e limitado às primeiras palavras — o que identifica o comerciante, não a ocorrência.
 */
export function rulePatternFrom(normalized: string): string {
  const words = tokens(normalized).filter((token) => !/^\d+$/.test(token));
  let pattern = '';
  for (const word of words) {
    const next = pattern === '' ? word : `${pattern} ${word}`;
    if (next.length > 60) break;
    pattern = next;
  }
  return pattern;
}
