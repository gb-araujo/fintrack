import {
  addDaysToDate,
  endOfMonth,
  isFutureDate,
  type AvailableComponents,
} from '@fintrack/shared';
import { BusinessRuleError } from '../../../shared/errors/index.js';

/**
 * Dinheiro disponível — regras em docs/financial-rules.md §4. Funções puras.
 *
 * disponível = saldo das contas líquidas
 *            + receitas pendentes até o horizonte
 *            + transferências pendentes que ENTRAM na fronteira líquida
 *            + receitas previstas por recorrências ainda não confirmadas (até o horizonte)
 *            − despesas pendentes até o horizonte (inclui atrasadas)
 *            − transferências pendentes que SAEM da fronteira líquida
 *            − despesas previstas por recorrências ainda não confirmadas (inclui atrasadas)
 *            − valor em aberto das faturas de cartão que vencem até o horizonte (inclui vencidas)
 *
 * Evita dupla contagem por construção:
 * - o saldo só conta lançamentos efetivados; pendentes entram apenas nos termos próprios;
 * - uma ocorrência de recorrência só é prevista enquanto NÃO há lançamento vinculado a ela (confirmado
 *   ou pulado): ao confirmar, a previsão some e o lançamento passa a contar — sem dupla contagem;
 * - transferência entre duas contas líquidas tem efeito líquido zero (não entra em nenhum termo);
 * - investimentos e contas fora do disponível não entram no saldo;
 * - compras no cartão só entram pela FATURA (parcelas − pagamentos efetivados): pagar a fatura tira o
 *   valor da conta e da fatura ao mesmo tempo, então o disponível não muda ao pagar (sem dupla contagem);
 * - lançamentos cancelados (e compras canceladas) nunca entram.
 */
export function availableAmount(components: AvailableComponents): number {
  return (
    components.liquidBalanceCents +
    components.pendingIncomeCents +
    components.pendingTransfersInCents +
    components.forecastIncomeCents -
    components.pendingExpensesCents -
    components.pendingTransfersOutCents -
    components.forecastExpensesCents -
    components.invoicesCents
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

/** Horizonte: a data pedida, ou hoje + `days`, ou (padrão) o último dia do mês. Nunca anterior a hoje. */
export function resolveHorizon(today: string, requested?: string, days?: number): string {
  const until = requested ?? (days !== undefined ? addDaysToDate(today, days) : endOfMonth(today));
  if (isFutureDate(today, until)) {
    throw new BusinessRuleError('O horizonte não pode ser anterior a hoje.');
  }
  return until;
}
