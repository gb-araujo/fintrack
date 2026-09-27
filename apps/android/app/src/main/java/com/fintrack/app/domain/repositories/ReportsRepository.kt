package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.BudgetHistoryReport
import com.fintrack.app.domain.models.CashFlowReport
import com.fintrack.app.domain.models.ExpensesByAccountReport
import com.fintrack.app.domain.models.ExpensesByCardReport
import com.fintrack.app.domain.models.ExpensesByCategoryReport
import com.fintrack.app.domain.models.IncomeVsExpensesReport
import com.fintrack.app.domain.models.InvestmentsReport
import com.fintrack.app.domain.models.MonthlyEvolutionReport
import com.fintrack.app.domain.models.NetWorthReport
import com.fintrack.app.domain.models.ReportPeriod

/** Relatórios (FASE 7). Sempre calculados no servidor — o app só exibe. */
interface ReportsRepository {
    suspend fun expensesByCategory(period: ReportPeriod): ExpensesByCategoryReport

    suspend fun incomeVsExpenses(period: ReportPeriod): IncomeVsExpensesReport

    suspend fun monthlyEvolution(months: Int): MonthlyEvolutionReport

    suspend fun expensesByAccount(period: ReportPeriod): ExpensesByAccountReport

    suspend fun expensesByCard(period: ReportPeriod): ExpensesByCardReport

    suspend fun cashFlow(period: ReportPeriod): CashFlowReport

    suspend fun budgetHistory(months: Int): BudgetHistoryReport

    suspend fun netWorth(months: Int): NetWorthReport

    suspend fun investments(period: ReportPeriod): InvestmentsReport
}
