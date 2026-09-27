package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
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
import com.fintrack.app.domain.repositories.ReportsRepository

/** Um caso de uso por relatório (FASE 7): apenas delega — a regra toda vive no backend. */
class GetExpensesByCategoryUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<ExpensesByCategoryReport> =
        suspendRunCatching { repository.expensesByCategory(period) }
}

class GetIncomeVsExpensesUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<IncomeVsExpensesReport> =
        suspendRunCatching { repository.incomeVsExpenses(period) }
}

class GetMonthlyEvolutionUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(months: Int): Result<MonthlyEvolutionReport> =
        suspendRunCatching { repository.monthlyEvolution(months) }
}

class GetExpensesByAccountUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<ExpensesByAccountReport> =
        suspendRunCatching { repository.expensesByAccount(period) }
}

class GetExpensesByCardUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<ExpensesByCardReport> =
        suspendRunCatching { repository.expensesByCard(period) }
}

class GetCashFlowUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<CashFlowReport> =
        suspendRunCatching { repository.cashFlow(period) }
}

class GetBudgetHistoryUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(months: Int): Result<BudgetHistoryReport> =
        suspendRunCatching { repository.budgetHistory(months) }
}

class GetNetWorthUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(months: Int): Result<NetWorthReport> =
        suspendRunCatching { repository.netWorth(months) }
}

class GetInvestmentsReportUseCase(private val repository: ReportsRepository) {
    suspend operator fun invoke(period: ReportPeriod): Result<InvestmentsReport> =
        suspendRunCatching { repository.investments(period) }
}
