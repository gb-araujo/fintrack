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

/**
 * Um item do fluxo de caixa até o horizonte: exatamente os itens que compõem o "Quanto posso
 * gastar?" (docs/financial-rules.md §4c), com o saldo projetado logo depois de cada um.
 */
export const cashflowEntrySchema = z.object({
  /** Id do lançamento/transferência pendente, "recurring:<id>:<data>" ou "invoice:<id>". */
  id: z.string(),
  kind: z.enum(['transaction', 'recurring', 'invoice', 'transfer']),
  /** `in` = entra nas contas disponíveis; `out` = sai delas. */
  direction: z.enum(['in', 'out']),
  description: z.string(),
  /** Sempre positivo: o sentido está em `direction`. */
  amountCents: signedCentsSchema,
  estimated: z.boolean(),
  date: dateOnlySchema,
  /** Data já passou e o item segue pendente: conta como se acontecesse hoje. */
  overdue: z.boolean(),
  accountId: z.uuid().nullable(),
  recurringId: z.uuid().nullable(),
  invoiceId: z.uuid().nullable(),
  /** Saldo projetado das contas disponíveis logo depois deste item. */
  balanceAfterCents: signedCentsSchema,
});
export type CashflowEntry = z.infer<typeof cashflowEntrySchema>;

export const cashflowSchema = z.object({
  /** Em ordem cronológica (vencidos primeiro; no mesmo dia, entradas antes das saídas). */
  entries: z.array(cashflowEntrySchema),
  /** Σ entradas até o horizonte. */
  inCents: signedCentsSchema,
  /** Σ saídas até o horizonte: o que precisa ficar guardado para as contas. */
  outCents: signedCentsSchema,
  /** Menor saldo projetado entre hoje (inclusive) e o horizonte. */
  lowestBalanceCents: signedCentsSchema,
  lowestBalanceDate: dateOnlySchema,
  /**
   * Quanto dá para gastar HOJE sem o saldo ficar negativo em nenhum dia até o horizonte
   * (= menor saldo projetado, nunca abaixo de zero). Pode ser menor que o "disponível", que só
   * olha o saldo no fim do horizonte: uma receita que chega depois de uma conta não a paga.
   */
  safeToSpendNowCents: signedCentsSchema,
});
export type Cashflow = z.infer<typeof cashflowSchema>;

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
  cashflow: cashflowSchema,
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export const MAX_HORIZON_DAYS = 366;

export const dashboardQuerySchema = z
  .object({
    /** Horizonte opcional (AAAA-MM-DD, não anterior a hoje). */
    until: dateOnlySchema.optional(),
    /** Alternativa a `until`: hoje + N dias (no fuso do usuário). */
    days: z.coerce
      .number({ error: 'Número de dias inválido.' })
      .int({ error: 'Número de dias inválido.' })
      .min(1, { error: 'Informe ao menos 1 dia.' })
      .max(MAX_HORIZON_DAYS, { error: `No máximo ${MAX_HORIZON_DAYS} dias.` })
      .optional(),
  })
  .refine((value) => value.until === undefined || value.days === undefined, {
    error: 'Informe o horizonte por data (until) ou por dias (days), não os dois.',
    path: ['days'],
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
