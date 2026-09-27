import { describe, expect, it } from 'vitest';
import { BusinessRuleError, ConflictError } from '../../../shared/errors/index.js';
import {
  assertAccountAcceptsEntry,
  assertCategoryFits,
  assertCompletedDateNotFuture,
  assertEditable,
  resolveCompletionDate,
  resolveInitialStatus,
} from './transaction-rules.js';

const today = '2026-09-27';

describe('resolveInitialStatus', () => {
  it('sem status informado: passado/hoje = efetivado, futuro = pendente', () => {
    expect(resolveInitialStatus(undefined, '2026-09-20', today)).toBe('completed');
    expect(resolveInitialStatus(undefined, today, today)).toBe('completed');
    expect(resolveInitialStatus(undefined, '2026-09-28', today)).toBe('pending');
  });

  it('pendente é permitido em qualquer data (conta a pagar já vencida, por exemplo)', () => {
    expect(resolveInitialStatus('pending', '2026-09-01', today)).toBe('pending');
    expect(resolveInitialStatus('pending', '2026-10-05', today)).toBe('pending');
  });

  it('efetivado com data futura é recusado', () => {
    expect(() => resolveInitialStatus('completed', '2026-09-28', today)).toThrow(BusinessRuleError);
    expect(resolveInitialStatus('completed', today, today)).toBe('completed');
  });
});

describe('resolveCompletionDate', () => {
  it('usa a data do lançamento se não for futura', () => {
    expect(resolveCompletionDate('2026-09-10', undefined, today)).toBe('2026-09-10');
  });

  it('pago antes do vencimento: precisa informar a data real', () => {
    expect(() => resolveCompletionDate('2026-10-05', undefined, today)).toThrow(BusinessRuleError);
    expect(resolveCompletionDate('2026-10-05', today, today)).toBe(today);
  });

  it('a data informada também não pode ser futura', () => {
    expect(() => resolveCompletionDate('2026-09-01', '2026-10-01', today)).toThrow(
      BusinessRuleError,
    );
  });
});

describe('assertCompletedDateNotFuture', () => {
  it('só restringe lançamentos efetivados', () => {
    expect(() => assertCompletedDateNotFuture('completed', '2026-10-01', today)).toThrow(
      BusinessRuleError,
    );
    expect(() => assertCompletedDateNotFuture('pending', '2026-10-01', today)).not.toThrow();
    expect(() => assertCompletedDateNotFuture('completed', today, today)).not.toThrow();
  });
});

describe('assertEditable', () => {
  it('cancelado é imutável', () => {
    expect(() => assertEditable('cancelled')).toThrow(ConflictError);
    expect(() => assertEditable('pending')).not.toThrow();
    expect(() => assertEditable('completed')).not.toThrow();
  });
});

describe('assertAccountAcceptsEntry', () => {
  it('conta arquivada não recebe lançamentos', () => {
    expect(() =>
      assertAccountAcceptsEntry({ archivedAt: new Date(), type: 'bank' }, 'expense'),
    ).toThrow(ConflictError);
  });

  it('conta de investimento só por transferência', () => {
    const investment = { archivedAt: null, type: 'investment' as const };
    expect(() => assertAccountAcceptsEntry(investment, 'expense')).toThrow(BusinessRuleError);
    expect(() => assertAccountAcceptsEntry(investment, 'income')).toThrow(BusinessRuleError);
    expect(() => assertAccountAcceptsEntry(investment, 'transfer')).not.toThrow();
  });

  it('banco e carteira aceitam receita e despesa', () => {
    expect(() =>
      assertAccountAcceptsEntry({ archivedAt: null, type: 'wallet' }, 'income'),
    ).not.toThrow();
    expect(() =>
      assertAccountAcceptsEntry({ archivedAt: null, type: 'bank' }, 'expense'),
    ).not.toThrow();
  });
});

describe('assertCategoryFits', () => {
  it('receita exige categoria de receita e despesa, de despesa', () => {
    expect(() => assertCategoryFits({ kind: 'income', archivedAt: null }, 'income')).not.toThrow();
    expect(() => assertCategoryFits({ kind: 'expense', archivedAt: null }, 'income')).toThrow(
      BusinessRuleError,
    );
    expect(() => assertCategoryFits({ kind: 'income', archivedAt: null }, 'expense')).toThrow(
      BusinessRuleError,
    );
  });

  it('categoria arquivada é recusada', () => {
    expect(() =>
      assertCategoryFits({ kind: 'expense', archivedAt: new Date() }, 'expense'),
    ).toThrow(ConflictError);
  });
});
