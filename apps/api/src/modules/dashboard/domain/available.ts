import { endOfMonth, isFutureDate, type AvailableComponents } from '@fintrack/shared';
import { BusinessRuleError } from '../../../shared/errors/index.js';

/**
 * "Quanto posso gastar?" — regras em docs/financial-rules.md §4. Funções puras.
 *
 * disponível = saldo das contas líquidas
 *            + receitas pendentes até o horizonte
 *            + transferências pendentes que ENTRAM na fronteira líquida
 *            − despesas pendentes até o horizonte (inclui atrasadas)
 *            − transferências pendentes que SAEM da fronteira líquida
 *
 * Evita dupla contagem por construção:
 * - o saldo só conta lançamentos efetivados; pendentes entram apenas nos termos próprios;
 * - transferência entre duas contas líquidas tem efeito líquido zero (não entra em nenhum termo);
 * - investimentos e contas fora do disponível não entram no saldo;
 * - lançamentos cancelados nunca entram.
 */
export function availableAmount(components: AvailableComponents): number {
  return (
    components.liquidBalanceCents +
    components.pendingIncomeCents +
    components.pendingTransfersInCents -
    components.pendingExpensesCents -
    components.pendingTransfersOutCents
  );
}

export interface LiquidityInput {
  type: 'bank' | 'wallet' | 'investment';
  includeInAvailable: boolean;
  archivedAt: Date | null;
}

/**
 * Conta "líquida" para o dinheiro disponível: banco ou carteira, ativa e marcada como disponível.
 * Contas de investimento NUNCA entram, mesmo que marcadas (o saldo delas é patrimônio, não caixa).
 */
export function isLiquidForAvailable(account: LiquidityInput): boolean {
  return account.type !== 'investment' && account.includeInAvailable && account.archivedAt === null;
}

/** Horizonte padrão: último dia do mês corrente. Nunca anterior a hoje. */
export function resolveHorizon(today: string, requested?: string): string {
  const until = requested ?? endOfMonth(today);
  if (isFutureDate(today, until)) {
    throw new BusinessRuleError('O horizonte não pode ser anterior a hoje.');
  }
  return until;
}
