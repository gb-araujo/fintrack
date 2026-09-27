package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.ReportsApi
import com.fintrack.app.data.models.toDomain
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
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ReportsRepositoryImpl(
    private val api: ReportsApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ReportsRepository {

    override suspend fun expensesByCategory(period: ReportPeriod) = withContext(ioDispatcher) {
        apiCall { api.expensesByCategory(period.from, period.to) }.toDomain()
    }

    override suspend fun incomeVsExpenses(period: ReportPeriod) = withContext(ioDispatcher) {
        apiCall { api.incomeVsExpenses(period.from, period.to) }.toDomain()
    }

    override suspend fun monthlyEvolution(months: Int): MonthlyEvolutionReport = withContext(ioDispatcher) {
        apiCall { api.monthlyEvolution(months) }.toDomain()
    }

    override suspend fun expensesByAccount(period: ReportPeriod) = withContext(ioDispatcher) {
        apiCall { api.expensesByAccount(period.from, period.to) }.toDomain()
    }

    override suspend fun expensesByCard(period: ReportPeriod) = withContext(ioDispatcher) {
        apiCall { api.expensesByCard(period.from, period.to) }.toDomain()
    }

    override suspend fun cashFlow(period: ReportPeriod): CashFlowReport = withContext(ioDispatcher) {
        apiCall { api.cashFlow(period.from, period.to) }.toDomain()
    }

    override suspend fun budgetHistory(months: Int): BudgetHistoryReport = withContext(ioDispatcher) {
        apiCall { api.budgetHistory(months) }.toDomain()
    }

    override suspend fun netWorth(months: Int): NetWorthReport = withContext(ioDispatcher) {
        apiCall { api.netWorth(months) }.toDomain()
    }

    override suspend fun investments(period: ReportPeriod): InvestmentsReport = withContext(ioDispatcher) {
        apiCall { api.investments(period.from, period.to) }.toDomain()
    }
}
