package com.fintrack.app.presentation.recurring

import com.fintrack.app.domain.usecases.ConfirmOccurrenceUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListOccurrencesUseCase
import com.fintrack.app.domain.usecases.SkipOccurrenceUseCase
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.FakePlanningRepository
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
class RecurringViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val planning = FakePlanningRepository()
    private val ledger = FakeLedgerRepository()

    private fun viewModel() = RecurringViewModel(
        ListOccurrencesUseCase(planning),
        ListAccountsUseCase(ledger),
        ConfirmOccurrenceUseCase(planning),
        SkipOccurrenceUseCase(planning),
        today = { "2026-09-27" },
    )

    @Test
    fun `lista as previsoes com o nome das contas`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("Aluguel", "Enel"), state.occurrences.map { it.name })
        assertEquals("Banco Inter", state.accountNames["acc-1"])
        assertEquals(false, state.isLoading)
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
        assertEquals(2, viewModel.uiState.value.occurrences.size)
    }

    @Test
    fun `ocorrencia atrasada abre a confirmacao com a data prevista e o valor preenchido`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.startConfirm(viewModel.uiState.value.occurrences[0])

        val form = viewModel.uiState.value.confirming!!
        assertEquals("1.500,00", form.amount)
        assertEquals("2026-09-25", form.date)
    }

    @Test
    fun `ocorrencia futura abre a confirmacao com data de hoje (nada e efetivado no futuro)`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.startConfirm(viewModel.uiState.value.occurrences[1])

        assertEquals("2026-09-27", viewModel.uiState.value.confirming!!.date)
    }

    @Test
    fun `confirmar envia o valor real e recarrega a lista`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.startConfirm(viewModel.uiState.value.occurrences[1])
        viewModel.onConfirmChange { it.copy(amount = "195,50") }

        viewModel.submitConfirm()
        advanceUntilIdle()

        assertEquals(listOf(listOf<Any>("rec-2", "2026-10-05", 19_550L, "2026-09-27")), planning.confirmed)
        assertNull(viewModel.uiState.value.confirming)
    }

    @Test
    fun `confirmar com valor invalido mostra erro no campo e mantem o dialogo`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.startConfirm(viewModel.uiState.value.occurrences[0])
        viewModel.onConfirmChange { it.copy(amount = "") }

        viewModel.submitConfirm()
        advanceUntilIdle()

        val form = viewModel.uiState.value.confirming!!
        assertEquals(setOf("amount"), form.errors.keys)
        assertTrue(planning.confirmed.isEmpty())
        assertEquals(false, form.submitting)
    }

    @Test
    fun `erro da API ao confirmar aparece no dialogo`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.startConfirm(viewModel.uiState.value.occurrences[0])
        planning.failure = IOException("offline")

        viewModel.submitConfirm()
        advanceUntilIdle()

        val form = viewModel.uiState.value.confirming!!
        assertTrue(form.formError!!.startsWith("Sem conexão"))
    }

    @Test
    fun `pular pede confirmacao e so entao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.startSkip(viewModel.uiState.value.occurrences[0])
        assertTrue(planning.skipped.isEmpty())
        viewModel.confirmSkip()
        advanceUntilIdle()

        assertEquals(listOf("rec-1" to "2026-09-25"), planning.skipped)
        assertNull(viewModel.uiState.value.skipping)
    }

    @Test
    fun `cancelar o dialogo de pular nao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.startSkip(viewModel.uiState.value.occurrences[0])

        viewModel.cancelSkip()

        assertNull(viewModel.uiState.value.skipping)
        assertTrue(planning.skipped.isEmpty())
    }
}
