package com.fintrack.app.presentation.cards

import com.fintrack.app.domain.usecases.CreateCardUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCardsUseCase
import com.fintrack.app.testing.FakeCardsRepository
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.account
import com.fintrack.app.domain.models.AccountType
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
class CardsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val cards = FakeCardsRepository()
    private val ledger = FakeLedgerRepository()

    private fun viewModel() = CardsViewModel(ListCardsUseCase(cards), CreateCardUseCase(cards), ListAccountsUseCase(ledger))

    @Test
    fun `lista cartoes com limite usado e disponivel do servidor`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val card = viewModel.uiState.value.cards.single()
        assertEquals(90_000L, card.usedLimitCents)
        assertEquals(410_000L, card.availableLimitCents)
    }

    @Test
    fun `contas de investimento nao aparecem como opcao de pagamento`() = runTest {
        ledger.accounts = listOf(account("a1", "Inter"), account("a2", "CDB", AccountType.INVESTMENT))
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(listOf("Inter"), viewModel.uiState.value.paymentAccounts.map { it.name })
    }

    @Test
    fun `falha de rede mostra erro e permite tentar de novo`() = runTest {
        cards.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))

        cards.failure = null
        viewModel.refresh()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.error)
        assertEquals(1, viewModel.uiState.value.cards.size)
    }

    @Test
    fun `novo cartao valida, envia e recarrega`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()

        viewModel.submit()
        advanceUntilIdle()
        assertEquals(setOf("name", "limit", "closingDay", "dueDay"), viewModel.uiState.value.form!!.errors.keys)
        assertTrue(cards.createdCards.isEmpty())

        viewModel.onFormChange { it.copy(name = "Inter Black", limit = "8.000,00", closingDay = "10", dueDay = "20") }
        viewModel.submit()
        advanceUntilIdle()

        val created = cards.createdCards.single()
        assertEquals("Inter Black", created.name)
        assertEquals(800_000L, created.limitCents)
        assertNull(viewModel.uiState.value.form)
    }
}
