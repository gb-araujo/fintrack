package com.fintrack.app.presentation.reports

import com.fintrack.app.domain.models.ReportPeriod
import com.fintrack.app.domain.usecases.GetBudgetHistoryUseCase
import com.fintrack.app.domain.usecases.GetCashFlowUseCase
import com.fintrack.app.domain.usecases.GetExpensesByAccountUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCardUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCategoryUseCase
import com.fintrack.app.domain.usecases.GetIncomeVsExpensesUseCase
import com.fintrack.app.domain.usecases.GetInvestmentsReportUseCase
import com.fintrack.app.domain.usecases.GetMonthlyEvolutionUseCase
import com.fintrack.app.domain.usecases.GetNetWorthUseCase
import com.fintrack.app.testing.FakeReportsRepository
import com.fintrack.app.testing.MainDispatcherRule
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ReportsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeReportsRepository()

    private fun viewModel() = ReportsViewModel(
        GetExpensesByCategoryUseCase(repository),
        GetIncomeVsExpensesUseCase(repository),
        GetMonthlyEvolutionUseCase(repository),
        GetExpensesByAccountUseCase(repository),
        GetExpensesByCardUseCase(repository),
        GetCashFlowUseCase(repository),
        GetBudgetHistoryUseCase(repository),
        GetNetWorthUseCase(repository),
        GetInvestmentsReportUseCase(repository),
    )

    @Test
    fun `comeca na aba de despesas por categoria e carrega o relatorio`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(ReportTab.EXPENSES_BY_CATEGORY, state.tab)
        assertEquals(40_000L, state.expensesByCategory?.totalCents)
        assertEquals(false, state.isLoading)
        assertEquals(listOf(ReportPeriod()), repository.requestedPeriods)
    }

    @Test
    fun `trocar de aba carrega o relatorio certo, uma vez so`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.selectTab(ReportTab.MONTHLY_EVOLUTION)
        advanceUntilIdle()

        assertEquals(2, viewModel.uiState.value.monthlyEvolution?.items?.size)
        assertEquals(listOf(12), repository.requestedMonths)
        assertTrue(viewModel.uiState.value.isPeriodTab.not())
    }

    @Test
    fun `abas por periodo x abas por meses`() {
        val viewModel = viewModel()
        assertTrue(ReportTab.EXPENSES_BY_CATEGORY in setOf(ReportTab.EXPENSES_BY_CATEGORY))
        assertEquals(ReportTab.CASH_FLOW.label, "Fluxo de caixa")
        viewModel.selectTab(ReportTab.CASH_FLOW)
        assertTrue(viewModel.uiState.value.isPeriodTab)
        viewModel.selectTab(ReportTab.NET_WORTH)
        assertTrue(viewModel.uiState.value.isPeriodTab.not())
    }

    @Test
    fun `trocar o periodo recarrega a aba atual com o novo periodo`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.setPeriod(ReportPeriod(from = "2026-01-01", to = "2026-01-31"))
        advanceUntilIdle()

        assertEquals(ReportPeriod(from = "2026-01-01", to = "2026-01-31"), repository.requestedPeriods.last())
    }

    @Test
    fun `trocar os meses recarrega a aba atual`() = runTest {
        val viewModel = viewModel()
        viewModel.selectTab(ReportTab.NET_WORTH)
        advanceUntilIdle()

        viewModel.setMonths(24)
        advanceUntilIdle()

        assertEquals(listOf(12, 24), repository.requestedMonths)
        assertEquals(1, viewModel.uiState.value.netWorth?.items?.size)
    }

    @Test
    fun `falha de rede mostra erro e retry tenta de novo`() = runTest {
        repository.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))

        repository.failure = null
        viewModel.retry()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.error)
        assertEquals(40_000L, viewModel.uiState.value.expensesByCategory?.totalCents)
    }

    @Test
    fun `selecionar a mesma aba de novo nao recarrega`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        val callsBefore = repository.requestedPeriods.size

        viewModel.selectTab(ReportTab.EXPENSES_BY_CATEGORY)
        advanceUntilIdle()

        assertEquals(callsBefore, repository.requestedPeriods.size)
    }

    @Test
    fun `cada aba expoe o relatorio certo`() = runTest {
        val viewModel = viewModel()

        viewModel.selectTab(ReportTab.INCOME_VS_EXPENSES)
        advanceUntilIdle()
        assertEquals(60, viewModel.uiState.value.incomeVsExpenses?.savingsPercent)

        viewModel.selectTab(ReportTab.EXPENSES_BY_ACCOUNT)
        advanceUntilIdle()
        assertEquals("Banco Inter", viewModel.uiState.value.expensesByAccount?.items?.single()?.accountName)

        viewModel.selectTab(ReportTab.EXPENSES_BY_CARD)
        advanceUntilIdle()
        assertEquals(90_000L, viewModel.uiState.value.expensesByCard?.purchasedCents)

        viewModel.selectTab(ReportTab.CASH_FLOW)
        advanceUntilIdle()
        assertEquals(250_000L, viewModel.uiState.value.cashFlow?.closingBalanceCents)

        viewModel.selectTab(ReportTab.BUDGET_HISTORY)
        advanceUntilIdle()
        assertEquals(1, viewModel.uiState.value.budgetHistory?.items?.single()?.exceededCount)

        viewModel.selectTab(ReportTab.INVESTMENTS)
        advanceUntilIdle()
        assertEquals(50_000L, viewModel.uiState.value.investments?.redeemedCents)
    }
}
