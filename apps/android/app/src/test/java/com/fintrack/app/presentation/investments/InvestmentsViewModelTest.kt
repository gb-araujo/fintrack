package com.fintrack.app.presentation.investments

import com.fintrack.app.domain.usecases.ListInvestmentsUseCase
import com.fintrack.app.testing.FakeInvestmentsRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.investmentSummary
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
class InvestmentsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeInvestmentsRepository()

    private fun viewModel() = InvestmentsViewModel(ListInvestmentsUseCase(repository))

    @Test
    fun `carrega a lista de contas de investimento`() = runTest {
        repository.summaries = listOf(investmentSummary(accountName = "CDB Banco X"))
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(false, state.isLoading)
        assertEquals("CDB Banco X", state.items.single().accountName)
    }

    @Test
    fun `falha de rede mostra erro e retry tenta de novo`() = runTest {
        repository.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))

        repository.failure = null
        viewModel.refresh()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.error)
        assertEquals(1, viewModel.uiState.value.items.size)
    }
}
