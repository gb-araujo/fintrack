package com.fintrack.app.presentation.transactions

import com.fintrack.app.domain.models.TransactionPage
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.models.TransferInfo
import com.fintrack.app.domain.usecases.CancelEntryUseCase
import com.fintrack.app.domain.usecases.CompleteEntryUseCase
import com.fintrack.app.domain.usecases.CreateTransactionUseCase
import com.fintrack.app.domain.usecases.CreateTransferUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListTransactionsUseCase
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.account
import com.fintrack.app.testing.transaction
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
class TransactionsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val today = "2026-09-27"
    private val repository = FakeLedgerRepository()

    private fun viewModel() = TransactionsViewModel(
        ListAccountsUseCase(repository), ListCategoriesUseCase(repository), ListTransactionsUseCase(repository),
        CreateTransactionUseCase(repository), CreateTransferUseCase(repository),
        CompleteEntryUseCase(repository), CancelEntryUseCase(repository), today = { today },
    )

    @Test
    fun `carrega contas, categorias e lancamentos`() = runTest {
        repository.pages = mapOf(null to TransactionPage(listOf(transaction("a"), transaction("b")), null))
        val viewModel = viewModel()
        assertTrue(viewModel.uiState.value.isLoading)

        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("a", "b"), state.items.map { it.id })
        assertEquals(2, state.accounts.size)
        assertEquals(2, state.categories.size)
        assertEquals(false, state.isLoading)
    }

    @Test
    fun `falha de rede mostra erro amigavel`() = runTest {
        repository.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))
    }

    @Test
    fun `carregar mais usa o cursor e acrescenta os itens`() = runTest {
        repository.pages = mapOf(
            null to TransactionPage(listOf(transaction("a")), "c2"),
            "c2" to TransactionPage(listOf(transaction("b")), null),
        )
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.loadMore()
        advanceUntilIdle()

        assertEquals(listOf("a", "b"), viewModel.uiState.value.items.map { it.id })
        assertNull(viewModel.uiState.value.nextCursor)
        assertEquals(listOf<String?>(null, "c2"), repository.requestedCursors)
    }

    @Test
    fun `novo lancamento sugere hoje e a primeira conta utilizavel (sem investimento)`() = runTest {
        repository.accounts = listOf(
            account("inv", "Tesouro", com.fintrack.app.domain.models.AccountType.INVESTMENT),
            account("acc-1", "Inter"),
        )
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.openEntry(EntryKind.EXPENSE)

        val form = (viewModel.uiState.value.dialog as TransactionsDialog.Entry).form
        assertEquals("acc-1", form.accountId)
        assertEquals(today, form.date)
    }

    @Test
    fun `salvar despesa envia o valor em centavos e recarrega a lista`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEntry(EntryKind.EXPENSE)
        viewModel.onEntryChange { it.copy(amount = "90,99", description = "Vivo", categoryId = "cat-1") }

        viewModel.submitEntry()
        advanceUntilIdle()

        val sent = repository.createdTransactions.single()
        assertEquals(9_099L, sent.amountCents)
        assertEquals(TransactionType.EXPENSE, sent.type)
        assertNull(viewModel.uiState.value.dialog)
        assertEquals(2, repository.requestedCursors.size) // carga inicial + recarga
    }

    @Test
    fun `valor invalido mostra erro no campo e nao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEntry(EntryKind.INCOME)
        viewModel.onEntryChange { it.copy(amount = "abc") }

        viewModel.submitEntry()
        advanceUntilIdle()

        val form = (viewModel.uiState.value.dialog as TransactionsDialog.Entry).form
        assertTrue(form.errors["amount"]!!.startsWith("Valor inválido"))
        assertTrue(repository.createdTransactions.isEmpty())
        assertEquals(false, form.submitting)
    }

    @Test
    fun `transferencia entre a mesma conta e recusada`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openEntry(EntryKind.TRANSFER)
        viewModel.onEntryChange { it.copy(toAccountId = it.accountId, amount = "10") }

        viewModel.submitEntry()
        advanceUntilIdle()

        val form = (viewModel.uiState.value.dialog as TransactionsDialog.Entry).form
        assertEquals("A conta de origem e a de destino devem ser diferentes.", form.errors["toAccount"])
        assertTrue(repository.createdTransfers.isEmpty())
    }

    @Test
    fun `efetivar pendente de hoje chama a API direto`() = runTest {
        val pending = transaction("p", status = TransactionStatus.PENDING, date = today)
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.requestComplete(pending)
        advanceUntilIdle()

        assertEquals(listOf("p" to null), repository.completed)
    }

    @Test
    fun `efetivar pendente futuro pergunta a data real antes`() = runTest {
        val future = transaction("f", status = TransactionStatus.PENDING, date = "2026-10-05")
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.requestComplete(future)
        val dialog = viewModel.uiState.value.dialog as TransactionsDialog.CompleteDate
        assertEquals(today, dialog.date)
        assertTrue(repository.completed.isEmpty())

        viewModel.confirmCompleteDate()
        advanceUntilIdle()

        assertEquals(listOf("f" to today), repository.completed)
        assertNull(viewModel.uiState.value.dialog)
    }

    @Test
    fun `cancelar pede confirmacao e cancela a transferencia inteira quando e perna`() = runTest {
        val leg = transaction(
            "leg", type = TransactionType.TRANSFER,
            transfer = TransferInfo("tr-1", isOutgoing = false, fromAccountId = "acc-1", toAccountId = "acc-2"),
        )
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.requestCancel(leg)
        assertTrue(viewModel.uiState.value.dialog is TransactionsDialog.ConfirmCancel)
        assertTrue(repository.cancelledTransfers.isEmpty())

        viewModel.confirmCancel()
        advanceUntilIdle()

        assertEquals(listOf("tr-1"), repository.cancelledTransfers)
        assertTrue(repository.cancelled.isEmpty())
        assertNull(viewModel.uiState.value.dialog)
    }

    @Test
    fun `erro ao cancelar fica na propria confirmacao`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.requestCancel(transaction("x"))
        repository.failure = IOException("offline")

        viewModel.confirmCancel()
        advanceUntilIdle()

        val dialog = viewModel.uiState.value.dialog as TransactionsDialog.ConfirmCancel
        assertTrue(dialog.error!!.startsWith("Sem conexão"))
    }
}
