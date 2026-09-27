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
  /** − valor em aberto das faturas de cartão com vencimento até o horizonte (inclui vencidas). */
  invoicesCents: signedCentsSchema,
});
export type AvailableComponents = z.infer<typeof availableComponentsSchema>;

export const pendingBillSchema = z.object({
  /** Id do lançamento pendente, "recurring:<id>:<data>" (previsões) ou "invoice:<id>" (faturas). */
  id: z.string(),
  kind: z.enum(['transaction', 'recurring', 'invoice']),
  /** Preenchido quando kind = "recurring" (para confirmar/pular a ocorrência). */
  recurringId: z.uuid().nullable(),
  /** Preenchido quando kind = "invoice" (para abrir/pagar a fatura). */
  invoiceId: z.uuid().nullable(),
  description: z.string(),
  amountCents: signedCentsSchema,
  /** Valor estimado (recorrência de valor variável). */
  estimated: z.boolean(),
  date: dateOnlySchema,
  /** Conta do lançamento; nas faturas, a conta de pagamento do cartão (pode não existir). */
  accountId: z.uuid().nullable(),
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
  /** Patrimônio: saldo das contas (líquidas + investimentos) − o que ainda se deve nos cartões. */
  netWorthCents: signedCentsSchema,
  /** Passivo dos cartões: valor em aberto de TODAS as faturas (inclui parcelas futuras). */
  cardLiabilitiesCents: signedCentsSchema,
  month: z.object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    /** Receitas efetivadas no mês (transferências e investimentos não contam). */
    incomeCents: signedCentsSchema,
    /**
     * Despesas do mês: efetivadas em conta + parcelas de cartão das faturas que VENCEM no mês
     * (transferências e pagamentos de fatura não contam — ADR 0005).
     */
    expenseCents: signedCentsSchema,
    /** Parte de `expenseCents` que vem de parcelas de cartão (informativo; não soma de novo). */
    cardExpenseCents: signedCentsSchema,
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
