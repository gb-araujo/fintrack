package com.fintrack.app.presentation.investments

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.domain.usecases.DeleteValuationUseCase
import com.fintrack.app.domain.usecases.ListInvestmentsUseCase
import com.fintrack.app.domain.usecases.ListValuationsUseCase
import com.fintrack.app.domain.usecases.UpdateInvestmentDetailsUseCase
import com.fintrack.app.domain.usecases.UpsertValuationUseCase
import com.fintrack.app.testing.FakeInvestmentsRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.investmentSummary
import com.fintrack.app.testing.investmentValuation
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class InvestmentDetailViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeInvestmentsRepository()
    private val today = "2026-09-27"

    private fun viewModel(accountId: String = "inv-1") = InvestmentDetailViewModel(
        accountId,
        ListInvestmentsUseCase(repository),
        ListValuationsUseCase(repository),
        UpsertValuationUseCase(repository),
        DeleteValuationUseCase(repository),
        UpdateInvestmentDetailsUseCase(repository),
        today = { today },
    )

    @Test
    fun `carrega o resumo e o historico (mais recente primeiro)`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1", accountName = "CDB"))
        repository.valuationsByAccount["inv-1"] = mutableListOf(
            investmentValuation(id = "v1", accountId = "inv-1", date = "2026-08-01"),
            investmentValuation(id = "v2", accountId = "inv-1", date = "2026-09-20"),
        )
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("CDB", state.investment?.accountName)
        assertEquals(listOf("v2", "v1"), state.valuations.map { it.id })
    }

    @Test
    fun `registra uma nova avaliacao com o valor digitado`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openValuationForm()
        viewModel.onValuationChange { it.copy(balance = "2000,00") }
        viewModel.submitValuation()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.valuationForm)
        assertEquals(200_000L, repository.upserted.single().balanceCents)
        assertEquals(today, repository.upserted.single().date)
    }

    @Test
    fun `valor invalido mostra erro de validacao sem chamar o repositorio`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openValuationForm()
        viewModel.onValuationChange { it.copy(balance = "") }
        viewModel.submitValuation()
        advanceUntilIdle()

        assertEquals("Informe o valor.", viewModel.uiState.value.valuationForm?.errors?.get("balance"))
        assertTrue(repository.upserted.isEmpty())
    }

    @Test
    fun `corrigir preenche o formulario com os dados da avaliacao`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val valuation = investmentValuation(accountId = "inv-1", date = "2026-09-20", balanceCents = 150_000, note = "Extrato")
        repository.valuationsByAccount["inv-1"] = mutableListOf(valuation)
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openValuationForm(valuation)

        val form = viewModel.uiState.value.valuationForm
        assertEquals("2026-09-20", form?.date)
        assertEquals("1.500,00", form?.balance)
        assertEquals("Extrato", form?.note)
    }

    @Test
    fun `erro da API ao registrar avaliacao aparece no formulario`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val viewModel = viewModel()
        advanceUntilIdle()
        repository.failure = ApiException(409, "CONFLICT", "A conta está arquivada.")

        viewModel.openValuationForm()
        viewModel.onValuationChange { it.copy(balance = "100,00") }
        viewModel.submitValuation()
        advanceUntilIdle()

        assertEquals("A conta está arquivada.", viewModel.uiState.value.valuationForm?.formError)
    }

    @Test
    fun `remove uma avaliacao apos confirmacao`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val valuation = investmentValuation(id = "v1", accountId = "inv-1")
        repository.valuationsByAccount["inv-1"] = mutableListOf(valuation)
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.askRemove(valuation)
        viewModel.confirmRemove()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.removing)
        assertEquals(listOf("inv-1" to "v1"), repository.deleted)
        assertTrue(viewModel.uiState.value.valuations.isEmpty())
    }

    @Test
    fun `edita instituicao e produto`() = runTest {
        repository.summaries = listOf(investmentSummary(accountId = "inv-1"))
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openDetailsForm()
        viewModel.onDetailsChange { it.copy(institution = "Banco X", product = "CDB 120% CDI") }
        viewModel.submitDetails()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.detailsForm)
        assertEquals(Triple("inv-1", "Banco X", "CDB 120% CDI"), repository.detailsUpdated.single())
        assertEquals("Banco X", viewModel.uiState.value.investment?.institution)
    }
}
