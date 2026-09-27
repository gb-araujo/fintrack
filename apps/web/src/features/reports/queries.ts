import { useQuery } from '@tanstack/react-query';
import * as reports from '../../services/reports';
import type { MonthsParams, PeriodParams } from '../../services/reports';

export function useExpensesByCategory(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'expenses-by-category', params],
    queryFn: ({ signal }) => reports.fetchExpensesByCategory(params, signal),
  });
}

export function useIncomeVsExpenses(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'income-vs-expenses', params],
    queryFn: ({ signal }) => reports.fetchIncomeVsExpenses(params, signal),
  });
}

export function useMonthlyEvolution(params: MonthsParams) {
  return useQuery({
    queryKey: ['reports', 'monthly-evolution', params],
    queryFn: ({ signal }) => reports.fetchMonthlyEvolution(params, signal),
  });
}

export function useExpensesByAccount(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'expenses-by-account', params],
    queryFn: ({ signal }) => reports.fetchExpensesByAccount(params, signal),
  });
}

export function useExpensesByCard(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'expenses-by-card', params],
    queryFn: ({ signal }) => reports.fetchExpensesByCard(params, signal),
  });
}

export function useCashFlow(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'cash-flow', params],
    queryFn: ({ signal }) => reports.fetchCashFlow(params, signal),
  });
}

export function useBudgetHistory(params: MonthsParams) {
  return useQuery({
    queryKey: ['reports', 'budget-history', params],
    queryFn: ({ signal }) => reports.fetchBudgetHistory(params, signal),
  });
}

export function useNetWorth(params: MonthsParams) {
  return useQuery({
    queryKey: ['reports', 'net-worth', params],
    queryFn: ({ signal }) => reports.fetchNetWorth(params, signal),
  });
}

export function useInvestments(params: PeriodParams) {
  return useQuery({
    queryKey: ['reports', 'investments', params],
    queryFn: ({ signal }) => reports.fetchInvestments(params, signal),
  });
}
