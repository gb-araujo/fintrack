import { isFutureDate, type TransactionStatus, type TransactionType } from '@fintrack/shared';
import { BusinessRuleError, ConflictError } from '../../../shared/errors/index.js';

/**
 * Regras de lançamentos (docs/financial-rules.md §5, ADR 0012).
 * Funções puras: recebem "hoje" explicitamente (data no fuso do usuário), nunca leem o relógio.
 */

/** Regra do tempo: só é "efetivado" o que já aconteceu (data até hoje); o futuro é previsão. */
export function resolveInitialStatus(
  requested: 'pending' | 'completed' | undefined,
  date: string,
  today: string,
): 'pending' | 'completed' {
  const future = isFutureDate(date, today);
  if (requested === 'completed' && future) {
    throw new BusinessRuleError(
      'Não é possível efetivar um lançamento com data futura. Deixe-o como pendente ou informe a data em que aconteceu.',
    );
  }
  return requested ?? (future ? 'pending' : 'completed');
}

/**
 * Data em que um lançamento pendente é efetivado: a informada ou, na falta dela, a do lançamento.
 * Nunca no futuro — nada é efetivado antes de acontecer.
 */
export function resolveCompletionDate(
  currentDate: string,
  requestedDate: string | undefined,
  today: string,
): string {
  const effective = requestedDate ?? currentDate;
  if (isFutureDate(effective, today)) {
    throw new BusinessRuleError(
      'Não é possível efetivar com data futura. Informe a data em que foi pago ou recebido (até hoje).',
    );
  }
  return effective;
}

/** Editar a data de um lançamento efetivado para o futuro o tornaria uma previsão com efeito no saldo. */
export function assertCompletedDateNotFuture(
  status: TransactionStatus,
  date: string,
  today: string,
) {
  if (status === 'completed' && isFutureDate(date, today)) {
    throw new BusinessRuleError(
      'Um lançamento efetivado não pode ter data futura. Cancele-o e lance como pendente.',
    );
  }
}

export function assertEditable(status: TransactionStatus): void {
  if (status === 'cancelled') {
    throw new ConflictError('Lançamento cancelado não pode ser alterado.');
  }
}

export interface EntryAccount {
  archivedAt: Date | null;
  type: 'bank' | 'wallet' | 'investment';
}

/**
 * Receita/despesa só em contas ativas e que não sejam de investimento: aplicação e resgate são
 * transferências (ADR 0006). Rendimentos serão tratados na FASE 8.
 */
export function assertAccountAcceptsEntry(account: EntryAccount, type: TransactionType): void {
  if (account.archivedAt) {
    throw new ConflictError('A conta está arquivada. Reative-a para lançar movimentações.');
  }
  if (account.type === 'investment' && (type === 'income' || type === 'expense')) {
    throw new BusinessRuleError(
      'Contas de investimento só recebem transferências (aplicação e resgate).',
    );
  }
}

export interface EntryCategory {
  kind: 'income' | 'expense';
  archivedAt: Date | null;
}

/** A categoria precisa ser do mesmo tipo do lançamento: receita usa categoria de receita. */
export function assertCategoryFits(category: EntryCategory, type: TransactionType): void {
  if (category.archivedAt) {
    throw new ConflictError('A categoria está arquivada. Escolha outra ou reative-a.');
  }
  if (category.kind !== type) {
    throw new BusinessRuleError(
      type === 'income'
        ? 'Escolha uma categoria de receita para este lançamento.'
        : 'Escolha uma categoria de despesa para este lançamento.',
    );
  }
}
