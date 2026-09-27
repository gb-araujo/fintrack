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
} from '@fintrack/shared';
import { apiRequest } from './http';

const API = '/api/v1/reports';

export interface PeriodParams {
  from?: string;
  to?: string;
  [key: string]: string | undefined;
}

export interface MonthsParams {
  months?: number;
  until?: string;
  [key: string]: string | number | undefined;
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const fetchExpensesByCategory = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/expenses-by-category${query(params)}`, {
    schema: expensesByCategorySchema,
    signal,
  });

export const fetchIncomeVsExpenses = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/income-vs-expenses${query(params)}`, {
    schema: incomeVsExpensesSchema,
    signal,
  });

export const fetchMonthlyEvolution = (params: MonthsParams, signal?: AbortSignal) =>
  apiRequest(`${API}/monthly-evolution${query(params)}`, {
    schema: monthlyEvolutionSchema,
    signal,
  });

export const fetchExpensesByAccount = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/expenses-by-account${query(params)}`, {
    schema: expensesByAccountSchema,
    signal,
  });

export const fetchExpensesByCard = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/expenses-by-card${query(params)}`, { schema: expensesByCardSchema, signal });

export const fetchCashFlow = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/cash-flow${query(params)}`, { schema: cashFlowSchema, signal });

export const fetchBudgetHistory = (params: MonthsParams, signal?: AbortSignal) =>
  apiRequest(`${API}/budget-history${query(params)}`, { schema: budgetHistorySchema, signal });

export const fetchNetWorth = (params: MonthsParams, signal?: AbortSignal) =>
  apiRequest(`${API}/net-worth${query(params)}`, { schema: netWorthSchema, signal });

export const fetchInvestments = (params: PeriodParams, signal?: AbortSignal) =>
  apiRequest(`${API}/investments${query(params)}`, { schema: investmentsReportSchema, signal });
