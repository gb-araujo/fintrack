package com.fintrack.app.presentation.budgets

import com.fintrack.app.domain.usecases.GetBudgetsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.SaveBudgetUseCase
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.FakePlanningRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.budget
import com.fintrack.app.testing.budgetSummary
import com.fintrack.app.testing.category
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
class BudgetsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val planning = FakePlanningRepository()
    private val ledger = FakeLedgerRepository().apply {
        categories = listOf(
            category("cat-1", "Alimentação"),
            category("cat-2", "Lazer"),
            category("cat-3", "Transporte"),
            category("cat-4", "Salário", CategoryKind.INCOME),
        )
    }

    private fun viewModel() = BudgetsViewModel(
        GetBudgetsUseCase(planning),
        SaveBudgetUseCase(planning),
        ListCategoriesUseCase(ledger),
        today = { "2026-09-27" },
    )

    @Test
    fun `carrega o mes atual com valores calculados pelo servidor`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("2026-09", state.month)
        assertEquals(listOf("2026-09"), planning.requestedMonths)
        assertEquals(25, state.summary!!.items.single().percentUsed)
        assertEquals(false, state.isLoading)
    }

    @Test
    fun `categorias oferecidas so de despesa e ainda sem orcamento no mes`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        // Alimentação já tem orçamento; Salário é receita.
        assertEquals(listOf("Lazer", "Transporte"), viewModel.uiState.value.availableCategories.map { it.name })
    }

    @Test
    fun `navegar entre meses consulta o mes certo`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.previousMonth()
        advanceUntilIdle()
        viewModel.nextMonth()
        viewModel.nextMonth()
        advanceUntilIdle()

        assertEquals("2026-10", viewModel.uiState.value.month)
        assertEquals("2026-10", planning.requestedMonths.last())
        assertTrue(planning.requestedMonths.contains("2026-08"))
    }

    @Test
    fun `virada de ano ao navegar`() = runTest {
        val viewModel = BudgetsViewModel(
            GetBudgetsUseCase(planning),
            SaveBudgetUseCase(planning),
            ListCategoriesUseCase(ledger),
            today = { "2026-01-10" },
        )
        advanceUntilIdle()

        viewModel.previousMonth()

        assertEquals("2025-12", viewModel.uiState.value.month)
    }

    @Test
    fun `falha de rede mostra erro e permite tentar de novo`() = runTest {
        planning.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))

        planning.failure = null
        viewModel.refresh()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.error)
        assertEquals(1, viewModel.uiState.value.summary!!.items.size)
    }

    @Test
    fun `criar orcamento valida, envia centavos, fecha o formulario e recarrega`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()
        viewModel.onFormChange { it.copy(categoryId = "cat-2", limit = "350,00") }

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(listOf(Triple("cat-2", "2026-09", 35_000L)), planning.savedBudgets)
        assertNull(viewModel.uiState.value.form)
        assertEquals(2, planning.requestedMonths.size)
    }

    @Test
    fun `formulario invalido mostra erros por campo e nao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()

        viewModel.submit()
        advanceUntilIdle()

        val form = viewModel.uiState.value.form!!
        assertEquals(setOf("category", "limit"), form.errors.keys)
        assertTrue(planning.savedBudgets.isEmpty())
        assertEquals(false, form.submitting)
    }

    @Test
    fun `editar preenche o limite atual e mantem a categoria`() = runTest {
        planning.budgetsProvider = { month -> budgetSummary(month, listOf(budget(limit = 80_000))) }
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openForm(viewModel.uiState.value.summary!!.items.single())

        val form = viewModel.uiState.value.form!!
        assertEquals("800,00", form.limit)
        assertEquals("cat-1", form.categoryId)
    }
}
