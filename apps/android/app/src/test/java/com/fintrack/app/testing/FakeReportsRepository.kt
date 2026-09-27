package com.fintrack.app.testing

import com.fintrack.app.domain.models.AccountExpense
import com.fintrack.app.domain.models.BudgetHistoryReport
import com.fintrack.app.domain.models.BudgetMonth
import com.fintrack.app.domain.models.CardExpense
import com.fintrack.app.domain.models.CashFlowReport
import com.fintrack.app.domain.models.CategoryExpense
import com.fintrack.app.domain.models.ExpensesByAccountReport
import com.fintrack.app.domain.models.ExpensesByCardReport
import com.fintrack.app.domain.models.ExpensesByCategoryReport
import com.fintrack.app.domain.models.IncomeVsExpensesReport
import com.fintrack.app.domain.models.InvestmentAccountReport
import com.fintrack.app.domain.models.InvestmentsReport
import com.fintrack.app.domain.models.MonthPoint
import com.fintrack.app.domain.models.MonthlyEvolutionReport
import com.fintrack.app.domain.models.NetWorthPoint
import com.fintrack.app.domain.models.NetWorthReport
import com.fintrack.app.domain.models.ReportPeriod
import com.fintrack.app.domain.repositories.ReportsRepository

class FakeReportsRepository : ReportsRepository {
    var expensesByCategoryResult = ExpensesByCategoryReport(
        totalCents = 40_000,
        items = listOf(CategoryExpense("cat-1", "Alimentação", 40_000, 40_000, 0, 100)),
    )
    var incomeVsExpensesResult = IncomeVsExpensesReport(500_000, 200_000, 0, 300_000, 60)
    var monthlyEvolutionResult = MonthlyEvolutionReport(
        listOf(MonthPoint("2026-08", 400_000, 150_000, 0, 250_000), MonthPoint("2026-09", 500_000, 200_000, 0, 300_000)),
    )
    var expensesByAccountResult = ExpensesByAccountReport(40_000, listOf(AccountExpense("acc-1", "Banco Inter", 40_000, 100)))
    var expensesByCardResult = ExpensesByCardReport(30_000, 90_000, listOf(CardExpense("card-1", "Nubank", 30_000, 90_000)))
    var cashFlowResult = CashFlowReport(100_000, 250_000, 200_000, 50_000, 0, 0, 0, 150_000)
    var budgetHistoryResult = BudgetHistoryReport(listOf(BudgetMonth("2026-09", 2, 70_000, 80_000, -10_000, 1)))
    var netWorthResult = NetWorthReport(listOf(NetWorthPoint("2026-09-27", 500_000, 100_000, 20_000, 580_000)))
    var investmentsResult = InvestmentsReport(
        150_000, 200_000, 50_000, 5_000,
        listOf(InvestmentAccountReport("inv-1", "CDB", 150_000, 200_000, 50_000, 150_000, 5_000)),
    )
    var failure: Throwable? = null

    val requestedPeriods = mutableListOf<ReportPeriod>()
    val requestedMonths = mutableListOf<Int>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun expensesByCategory(period: ReportPeriod): ExpensesByCategoryReport {
        maybeFail(); requestedPeriods += period; return expensesByCategoryResult
    }

    override suspend fun incomeVsExpenses(period: ReportPeriod): IncomeVsExpensesReport {
        maybeFail(); requestedPeriods += period; return incomeVsExpensesResult
    }

    override suspend fun monthlyEvolution(months: Int): MonthlyEvolutionReport {
        maybeFail(); requestedMonths += months; return monthlyEvolutionResult
    }

    override suspend fun expensesByAccount(period: ReportPeriod): ExpensesByAccountReport {
        maybeFail(); requestedPeriods += period; return expensesByAccountResult
    }

    override suspend fun expensesByCard(period: ReportPeriod): ExpensesByCardReport {
        maybeFail(); requestedPeriods += period; return expensesByCardResult
    }

    override suspend fun cashFlow(period: ReportPeriod): CashFlowReport {
        maybeFail(); requestedPeriods += period; return cashFlowResult
    }

    override suspend fun budgetHistory(months: Int): BudgetHistoryReport {
        maybeFail(); requestedMonths += months; return budgetHistoryResult
    }

    override suspend fun netWorth(months: Int): NetWorthReport {
        maybeFail(); requestedMonths += months; return netWorthResult
    }

    override suspend fun investments(period: ReportPeriod): InvestmentsReport {
        maybeFail(); requestedPeriods += period; return investmentsResult
    }
}
