package com.fintrack.app.presentation.cards

import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.usecases.CancelPurchaseUseCase
import com.fintrack.app.domain.usecases.CreatePurchaseUseCase
import com.fintrack.app.domain.usecases.GetCardUseCase
import com.fintrack.app.domain.usecases.GetInvoiceUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListInvoicesUseCase
import com.fintrack.app.domain.usecases.ListPurchasesUseCase
import com.fintrack.app.domain.usecases.PayInvoiceUseCase
import com.fintrack.app.testing.FakeCardsRepository
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.creditCard
import com.fintrack.app.testing.invoice
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class CardDetailViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val cards = FakeCardsRepository()
    private val ledger = FakeLedgerRepository()

    private fun viewModel() = CardDetailViewModel(
        cardId = "card-1",
        getCard = GetCardUseCase(cards),
        listInvoices = ListInvoicesUseCase(cards),
        getInvoice = GetInvoiceUseCase(cards),
        listPurchases = ListPurchasesUseCase(cards),
        createPurchase = CreatePurchaseUseCase(cards),
        cancelPurchase = CancelPurchaseUseCase(cards),
        payInvoice = PayInvoiceUseCase(cards),
        listAccounts = ListAccountsUseCase(ledger),
        listCategories = ListCategoriesUseCase(ledger),
        today = { "2026-09-27" },
    )

    @Test
    fun `carrega cartao, faturas, compras e contas`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Nubank", state.card?.name)
        assertEquals(listOf("2026-11", "2026-10"), state.invoices.map { it.referenceMonth })
        assertEquals(listOf("Notebook", "Café"), state.purchases.map { it.description })
        assertEquals(listOf("Banco Inter", "Mercado Pago"), state.paymentAccounts.map { it.name })
        assertEquals(listOf("Alimentação"), state.expenseCategories.map { it.name })
        assertEquals(false, state.isLoading)
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
        assertNotNull(viewModel.uiState.value.card)
    }

    @Test
    fun `expandir a fatura carrega o detalhe e tocar de novo recolhe`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.toggleInvoice("inv-1")
        advanceUntilIdle()
        assertEquals("inv-1", viewModel.uiState.value.expandedDetail?.summary?.id)
        assertEquals(1, viewModel.uiState.value.expandedDetail?.installments?.size)

        viewModel.toggleInvoice("inv-1")
        assertNull(viewModel.uiState.value.expandedInvoiceId)
        assertNull(viewModel.uiState.value.expandedDetail)
    }

    @Test
    fun `nova compra abre com a data de hoje, valida e envia`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openPurchaseForm()
        assertEquals("2026-09-27", viewModel.uiState.value.purchaseForm!!.date)

        viewModel.submitPurchase()
        advanceUntilIdle()
        assertEquals(setOf("description", "amount"), viewModel.uiState.value.purchaseForm!!.errors.keys)
        assertTrue(cards.createdPurchases.isEmpty())

        viewModel.onPurchaseChange { it.copy(description = "Notebook", amount = "900,00", installments = "3") }
        viewModel.submitPurchase()
        advanceUntilIdle()

        val (cardId, purchase) = cards.createdPurchases.single()
        assertEquals("card-1", cardId)
        assertEquals(90_000L, purchase.totalAmountCents)
        assertEquals(3, purchase.installmentsCount)
        assertNull(viewModel.uiState.value.purchaseForm)
    }

    @Test
    fun `pagar fatura sugere o valor restante e a conta do cartao`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.toggleInvoice("inv-1")
        advanceUntilIdle()

        viewModel.openPay(viewModel.uiState.value.expandedDetail as InvoiceDetail)

        val form = viewModel.uiState.value.payForm!!
        assertEquals("900,00", form.amount)
        assertEquals("acc-1", form.accountId)
        assertEquals("2026-09-27", form.date)
    }

    @Test
    fun `pagar fatura descontando o que ja esta agendado`() = runTest {
        cards.invoices = listOf(invoice(total = 90_000, paid = 30_000, scheduled = 20_000))
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.toggleInvoice("inv-1")
        advanceUntilIdle()

        viewModel.openPay(viewModel.uiState.value.expandedDetail as InvoiceDetail)

        assertEquals("400,00", viewModel.uiState.value.payForm!!.amount)
    }

    @Test
    fun `pagar envia conta, centavos e data e recarrega`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.toggleInvoice("inv-1")
        advanceUntilIdle()
        viewModel.openPay(viewModel.uiState.value.expandedDetail as InvoiceDetail)
        viewModel.onPayChange { it.copy(amount = "250,50", accountId = "acc-2") }

        viewModel.submitPay()
        advanceUntilIdle()

        assertEquals(listOf(listOf<Any>("inv-1", "acc-2", 25_050L, "2026-09-27")), cards.payments)
        assertNull(viewModel.uiState.value.payForm)
    }

    @Test
    fun `erro da API ao pagar fica no dialogo`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.toggleInvoice("inv-1")
        advanceUntilIdle()
        viewModel.openPay(viewModel.uiState.value.expandedDetail as InvoiceDetail)
        cards.failure = IOException("offline")

        viewModel.submitPay()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.payForm!!.formError!!.startsWith("Sem conexão"))
    }

    @Test
    fun `cancelar compra pede confirmacao e so entao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.askCancel(viewModel.uiState.value.purchases[0])
        assertTrue(cards.cancelledPurchases.isEmpty())
        viewModel.confirmCancel()
        advanceUntilIdle()

        assertEquals(listOf("pur-1"), cards.cancelledPurchases)
        assertNull(viewModel.uiState.value.cancelling)
    }

    @Test
    fun `dispensar o dialogo de cancelar nao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.askCancel(viewModel.uiState.value.purchases[0])

        viewModel.dismissCancel()

        assertNull(viewModel.uiState.value.cancelling)
        assertTrue(cards.cancelledPurchases.isEmpty())
    }

    @Test
    fun `cartao existente sem fatura aberta continua carregando`() = runTest {
        cards.cards = listOf(creditCard(openInvoice = null))
        cards.invoices = emptyList()
        val viewModel = viewModel()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.invoices.isEmpty())
        assertNotNull(viewModel.uiState.value.card)
    }
}
