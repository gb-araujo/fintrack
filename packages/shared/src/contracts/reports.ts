import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { signedCentsSchema } from '../money/money.js';
import { monthSchema } from './budgets.js';

/**
 * Relatórios (docs/financial-rules.md §8, ADR 0019). Tudo é calculado no backend com as MESMAS
 * definições do painel, do orçamento e das faturas — os relatórios fecham entre si (ver os testes de
 * invariantes): despesa = despesas EFETIVADAS em conta + parcelas de cartão reconhecidas no mês do
 * vencimento da fatura; transferências, investimentos e pagamentos de fatura nunca são despesa;
 * resgates nunca são receita.
 */

export const MAX_REPORT_DAYS = 1_830; // ~5 anos

/** Período [from, to] (inclusive). Padrão: o mês corrente no fuso do usuário. */
export const reportPeriodQuerySchema = z
  .object({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    error: 'A data inicial deve ser anterior ou igual à final.',
    path: ['from'],
  });
export type ReportPeriodQuery = z.infer<typeof reportPeriodQuerySchema>;

export const reportPeriodSchema = z.object({ from: dateOnlySchema, to: dateOnlySchema });
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;

/** Últimos N meses até `until` (AAAA-MM; padrão: o mês corrente). */
export const reportMonthsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).default(12),
  until: monthSchema.optional(),
});
export type ReportMonthsQuery = z.output<typeof reportMonthsQuerySchema>;

const cents = signedCentsSchema;
const percent = z.number().int().min(0);

// ---------- Despesas por categoria ----------
export const expensesByCategorySchema = z.object({
  period: reportPeriodSchema,
  totalCents: cents,
  items: z.array(
    z.object({
      /** null = despesas sem categoria. */
      categoryId: z.uuid().nullable(),
      categoryName: z.string(),
      totalCents: cents,
      /** Parte paga direto de conta (débito, pix, dinheiro). */
      accountCents: cents,
      /** Parte vinda de parcelas de cartão (mês do vencimento da fatura). */
      cardCents: cents,
      /** % do total do período (inteiro arredondado). */
      percent,
    }),
  ),
});
export type ExpensesByCategory = z.infer<typeof expensesByCategorySchema>;

// ---------- Receitas × despesas ----------
export const incomeVsExpensesSchema = z.object({
  period: reportPeriodSchema,
  incomeCents: cents,
  /** Despesas do período (conta + parcelas de cartão). */
  expenseCents: cents,
  /** Parte de `expenseCents` que vem de parcelas de cartão. */
  cardExpenseCents: cents,
  netCents: cents,
  /** (receitas − despesas) / receitas, em %; null sem receitas no período. */
  savingsPercent: z.number().int().nullable(),
});
export type IncomeVsExpenses = z.infer<typeof incomeVsExpensesSchema>;

// ---------- Evolução mensal ----------
export const monthlyEvolutionSchema = z.object({
  items: z.array(
    z.object({
      month: monthSchema,
      incomeCents: cents,
      expenseCents: cents,
      cardExpenseCents: cents,
      netCents: cents,
    }),
  ),
});
export type MonthlyEvolution = z.infer<typeof monthlyEvolutionSchema>;

// ---------- Gastos por conta ----------
export const expensesByAccountSchema = z.object({
  period: reportPeriodSchema,
  /** Despesas pagas por contas (parcelas de cartão ficam em "por cartão"). */
  totalCents: cents,
  items: z.array(
    z.object({
      accountId: z.uuid(),
      accountName: z.string(),
      totalCents: cents,
      percent,
    }),
  ),
});
export type ExpensesByAccount = z.infer<typeof expensesByAccountSchema>;

// ---------- Gastos por cartão ----------
export const expensesByCardSchema = z.object({
  period: reportPeriodSchema,
  /** Despesa reconhecida: parcelas das faturas que vencem no período. */
  installmentsCents: cents,
  /** INFORMATIVO: valor total das compras feitas no período (não entra em nenhuma soma de despesa). */
  purchasedCents: cents,
  items: z.array(
    z.object({
      cardId: z.uuid(),
      cardName: z.string(),
      installmentsCents: cents,
      purchasedCents: cents,
    }),
  ),
});
export type ExpensesByCard = z.infer<typeof expensesByCardSchema>;

// ---------- Fluxo de caixa ----------
export const cashFlowSchema = z.object({
  period: reportPeriodSchema,
  /** Saldo das contas líquidas (banco/carteira ativas e marcadas como disponíveis) antes do período. */
  openingBalanceCents: cents,
  closingBalanceCents: cents,
  incomeCents: cents,
  expensesCents: cents,
  /** Pagamentos de fatura: saem do caixa (a despesa já foi contada nas parcelas). */
  cardPaymentsCents: cents,
  /** Transferências para fora do caixa líquido (aplicações em investimento etc.). */
  transfersOutCents: cents,
  /** Transferências para dentro do caixa líquido (resgates etc.) — nunca são receita. */
  transfersInCents: cents,
  /** entradas − saídas; sempre igual a fechamento − abertura. */
  netCents: cents,
});
export type CashFlow = z.infer<typeof cashFlowSchema>;

// ---------- Orçamento ao longo dos meses ----------
export const budgetHistorySchema = z.object({
  items: z.array(
    z.object({
      month: monthSchema,
      budgetsCount: z.number().int().nonnegative(),
      limitCents: cents,
      spentCents: cents,
      remainingCents: cents,
      exceededCount: z.number().int().nonnegative(),
    }),
  ),
});
export type BudgetHistory = z.infer<typeof budgetHistorySchema>;

// ---------- Patrimônio ----------
export const netWorthSchema = z.object({
  items: z.array(
    z.object({
      /** Fim do mês (ou hoje, para o mês corrente). */
      date: dateOnlySchema,
      /** Bancos e carteiras. */
      cashCents: cents,
      /** Contas de investimento. */
      investmentsCents: cents,
      /** O que se devia nos cartões nessa data. */
      cardLiabilitiesCents: cents,
      /** caixa + investimentos − cartões. */
      netWorthCents: cents,
    }),
  ),
});
export type NetWorth = z.infer<typeof netWorthSchema>;

// ---------- Investimentos ----------
export const investmentsReportSchema = z.object({
  period: reportPeriodSchema,
  totalBalanceCents: cents,
  /** Aplicações (transferências para a conta de investimento) no período. */
  appliedCents: cents,
  /** Resgates (transferências da conta de investimento) no período — não são receita. */
  redeemedCents: cents,
  /**
   * Soma dos rendimentos do período (só das contas com avaliação cobrindo o período — ADR 0020);
   * `null` quando nenhuma conta tem avaliação suficiente para calcular.
   */
  yieldCents: cents.nullable(),
  items: z.array(
    z.object({
      accountId: z.uuid(),
      accountName: z.string(),
      balanceCents: cents,
      appliedCents: cents,
      redeemedCents: cents,
      /** Total aplicado − total resgatado desde o início (não é rendimento). */
      netContributedCents: cents,
      /** Rendimento no período (avaliação final − inicial − aportes no meio); null sem avaliação. */
      yieldCents: cents.nullable(),
    }),
  ),
});
export type InvestmentsReport = z.infer<typeof investmentsReportSchema>;
