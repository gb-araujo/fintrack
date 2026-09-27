import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { signedCentsSchema } from '../money/money.js';

/**
 * "Quanto posso gastar?" — calculado SEMPRE no backend (docs/financial-rules.md §4).
 * Todos os componentes são devolvidos para o usuário entender o número.
 */
export const availableComponentsSchema = z.object({
  /** Σ saldo atual das contas líquidas (banco/carteira, ativas, marcadas como "disponível"). */
  liquidBalanceCents: signedCentsSchema,
  /** + receitas pendentes nessas contas com data até o horizonte. */
  pendingIncomeCents: signedCentsSchema,
  /** − despesas pendentes nessas contas com data até o horizonte (inclui atrasadas). */
  pendingExpensesCents: signedCentsSchema,
  /** + transferências pendentes que ENTRAM na fronteira líquida (ex.: resgate agendado). */
  pendingTransfersInCents: signedCentsSchema,
  /** − transferências pendentes que SAEM da fronteira líquida (ex.: aplicação agendada). */
  pendingTransfersOutCents: signedCentsSchema,
  /** + receitas previstas por recorrências ainda não confirmadas (até o horizonte). */
  forecastIncomeCents: signedCentsSchema,
  /** − despesas previstas por recorrências ainda não confirmadas (até o horizonte, inclui atrasadas). */
  forecastExpensesCents: signedCentsSchema,
});
export type AvailableComponents = z.infer<typeof availableComponentsSchema>;

export const pendingBillSchema = z.object({
  /** Id do lançamento pendente, ou "recurring:<id>:<data>" para previsões de recorrências. */
  id: z.string(),
  kind: z.enum(['transaction', 'recurring']),
  /** Preenchido quando kind = "recurring" (para confirmar/pular a ocorrência). */
  recurringId: z.uuid().nullable(),
  description: z.string(),
  amountCents: signedCentsSchema,
  /** Valor estimado (recorrência de valor variável). */
  estimated: z.boolean(),
  date: dateOnlySchema,
  accountId: z.uuid(),
  categoryId: z.uuid().nullable(),
  overdue: z.boolean(),
});
export type PendingBill = z.infer<typeof pendingBillSchema>;

export const dashboardSchema = z.object({
  today: dateOnlySchema,
  /** Horizonte do cálculo (padrão: último dia do mês corrente, no fuso do usuário). */
  until: dateOnlySchema,
  availableToSpend: z.object({
    amountCents: signedCentsSchema,
    components: availableComponentsSchema,
  }),
  /** Saldo total das contas bancárias e carteiras (ativas). */
  totalBalanceCents: signedCentsSchema,
  /** Saldo das contas de investimento (não entram no "disponível"). */
  investmentsCents: signedCentsSchema,
  /** Total geral das contas: líquidas + investimentos. */
  netWorthCents: signedCentsSchema,
  month: z.object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    /** Receitas efetivadas no mês (transferências e investimentos não contam). */
    incomeCents: signedCentsSchema,
    /** Despesas efetivadas no mês (transferências e pagamentos de fatura não contam). */
    expenseCents: signedCentsSchema,
  }),
  pendingBills: z.object({
    /** Despesas pendentes com data até o horizonte. */
    count: z.number().int().nonnegative(),
    totalCents: signedCentsSchema,
    overdueCount: z.number().int().nonnegative(),
    overdueCents: signedCentsSchema,
    /** As próximas contas a pagar (mais antigas primeiro). */
    next: z.array(pendingBillSchema),
  }),
  /** Despesas já previstas para depois do horizonte. */
  futureCommitments: z.object({
    count: z.number().int().nonnegative(),
    totalCents: signedCentsSchema,
  }),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const dashboardQuerySchema = z.object({
  /** Horizonte opcional (AAAA-MM-DD, não anterior a hoje). */
  until: dateOnlySchema.optional(),
});
