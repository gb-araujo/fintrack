import {
  budgetHistorySchema,
  cashFlowSchema,
  expensesByAccountSchema,
  expensesByCardSchema,
  expensesByCategorySchema,
  incomeVsExpensesSchema,
  investmentsReportSchema,
  monthlyEvolutionSchema,
  netWorthSchema,
  reportMonthsQuerySchema,
  reportPeriodQuerySchema,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import type { ReportsService } from './reports.service.js';

export interface ReportsRoutesOptions {
  reportsService: ReportsService;
}

const security = [{ bearerAuth: [] }];
const tags = ['reports'];

/** Relatórios: só leitura, calculados no backend. Período padrão = mês corrente (fuso do usuário). */
export const reportsRoutes: FastifyPluginCallbackZod<ReportsRoutesOptions> = (
  app,
  { reportsService: service },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  const periodRoutes = [
    [
      '/reports/expenses-by-category',
      'Despesas por categoria (conta + parcelas de cartão; sem transferências nem pagamento de fatura)',
      expensesByCategorySchema,
      (userId: string, query: Parameters<ReportsService['expensesByCategory']>[1]) =>
        service.expensesByCategory(userId, query),
    ],
    [
      '/reports/income-vs-expenses',
      'Receitas × despesas do período (resgates não são receita)',
      incomeVsExpensesSchema,
      (userId: string, query: Parameters<ReportsService['incomeVsExpenses']>[1]) =>
        service.incomeVsExpenses(userId, query),
    ],
    [
      '/reports/expenses-by-account',
      'Despesas pagas por cada conta',
      expensesByAccountSchema,
      (userId: string, query: Parameters<ReportsService['expensesByAccount']>[1]) =>
        service.expensesByAccount(userId, query),
    ],
    [
      '/reports/expenses-by-card',
      'Gastos por cartão: parcelas reconhecidas + valor comprado (informativo)',
      expensesByCardSchema,
      (userId: string, query: Parameters<ReportsService['expensesByCard']>[1]) =>
        service.expensesByCard(userId, query),
    ],
    [
      '/reports/cash-flow',
      'Fluxo de caixa das contas líquidas: abertura + entradas − saídas = fechamento',
      cashFlowSchema,
      (userId: string, query: Parameters<ReportsService['cashFlow']>[1]) =>
        service.cashFlow(userId, query),
    ],
    [
      '/reports/investments',
      'Investimentos: posição, aplicações e resgates (rendimentos: FASE 8)',
      investmentsReportSchema,
      (userId: string, query: Parameters<ReportsService['investments']>[1]) =>
        service.investments(userId, query),
    ],
  ] as const;

  for (const [path, summary, response, handler] of periodRoutes) {
    app.get(
      path,
      {
        schema: {
          tags,
          summary,
          security,
          querystring: reportPeriodQuerySchema,
          response: { 200: response },
        },
      },
      (request) => handler(request.userId, request.query) as never,
    );
  }

  const monthsRoutes = [
    [
      '/reports/monthly-evolution',
      'Receitas, despesas e saldo do mês nos últimos N meses',
      monthlyEvolutionSchema,
      (userId: string, query: Parameters<ReportsService['monthlyEvolution']>[1]) =>
        service.monthlyEvolution(userId, query),
    ],
    [
      '/reports/budget-history',
      'Orçamento ao longo dos meses: limite × gasto',
      budgetHistorySchema,
      (userId: string, query: Parameters<ReportsService['budgetHistory']>[1]) =>
        service.budgetHistory(userId, query),
    ],
    [
      '/reports/net-worth',
      'Patrimônio no fim de cada mês (caixa + investimentos − cartões)',
      netWorthSchema,
      (userId: string, query: Parameters<ReportsService['netWorth']>[1]) =>
        service.netWorth(userId, query),
    ],
  ] as const;

  for (const [path, summary, response, handler] of monthsRoutes) {
    app.get(
      path,
      {
        schema: {
          tags,
          summary,
          security,
          querystring: reportMonthsQuerySchema,
          response: { 200: response },
        },
      },
      (request) => handler(request.userId, request.query) as never,
    );
  }

  done();
};
