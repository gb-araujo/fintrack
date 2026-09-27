package com.fintrack.app.presentation.imports

import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.ImportRowType
import com.fintrack.app.domain.usecases.CancelImportUseCase
import com.fintrack.app.domain.usecases.ConfirmImportUseCase
import com.fintrack.app.domain.usecases.CreateImportUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListPayableInvoicesUseCase
import com.fintrack.app.testing.FakeImportsRepository
import com.fintrack.app.testing.FakeLedgerRepository
import com.fintrack.app.testing.MainDispatcherRule
import com.fintrack.app.testing.account
import com.fintrack.app.testing.importRow
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ImportViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val imports = FakeImportsRepository()
    private val ledger = FakeLedgerRepository().apply {
        accounts = listOf(account("acc-1", "Banco Inter"), account("acc-2", "Mercado Pago"), account("acc-3", "CDB", AccountType.INVESTMENT))
    }

    private fun viewModel() = ImportViewModel(
        ListAccountsUseCase(ledger),
        ListCategoriesUseCase(ledger),
        ListPayableInvoicesUseCase(imports),
        CreateImportUseCase(imports),
        ConfirmImportUseCase(imports),
        CancelImportUseCase(imports),
    )

    @Test
    fun `carrega contas (sem investimento), seleciona a primeira e as categorias`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(listOf("Banco Inter", "Mercado Pago"), state.accounts.map { it.name })
        assertEquals("acc-1", state.selectedAccountId)
        assertEquals(2, state.categories.size)
    }

    @Test
    fun `enviar o arquivo cria a revisao com as escolhas iniciais vindas do servidor`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.selectAccount("acc-2")

        viewModel.upload("extrato.csv", "Data;Descricao;Valor\n...")
        advanceUntilIdle()

        assertEquals(listOf(Triple("acc-2", "extrato.csv", "Data;Descricao;Valor\n...")), imports.created)
        val state = viewModel.uiState.value
        assertNotNull(state.review)
        assertEquals(3, state.review!!.rows.size)
        // Duplicata começa desmarcada (mas continua na lista).
        assertEquals(listOf(true, true, false), state.review!!.rows.map { state.choices[it.id]!!.import })
        assertEquals(2, state.selectedCount)
        assertEquals(1, state.payableInvoices.size)
        assertFalse(state.uploading)
    }

    @Test
    fun `arquivo vazio nao chama a API`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.upload("x.csv", "   ")
        advanceUntilIdle()

        assertTrue(imports.created.isEmpty())
        assertEquals("O arquivo está vazio.", viewModel.uiState.value.error)
    }

    @Test
    fun `erro do servidor ao ler o arquivo aparece na tela inicial`() = runTest {
        imports.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))
        assertNull(viewModel.uiState.value.review)
    }

    @Test
    fun `trocar a escolha de uma linha atualiza so aquela linha`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()

        viewModel.onChoice("r3") { it.copy(import = true, categoryId = "cat-1") }

        val state = viewModel.uiState.value
        assertEquals(3, state.selectedCount)
        assertEquals("cat-1", state.choices["r3"]!!.categoryId)
        assertEquals("cat-1", state.choices["r1"]!!.categoryId)
    }

    @Test
    fun `confirmar envia uma escolha por linha e mostra o resultado`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()

        viewModel.confirm()
        advanceUntilIdle()

        val (importId, choices) = imports.confirmed.single()
        assertEquals("imp-1", importId)
        assertEquals(setOf("r1", "r2", "r3"), choices.keys)
        assertEquals(2, viewModel.uiState.value.result!!.imported)
        assertEquals(1, viewModel.uiState.value.result!!.skipped)
    }

    @Test
    fun `transferencia sem conta e pagamento de fatura sem fatura bloqueiam a confirmacao por linha`() = runTest {
        imports.rows = listOf(
            importRow("t1", 2, "PIX ENVIADO", type = ImportRowType.TRANSFER, categoryId = null, targetAccountId = null),
            importRow("p1", 3, "PGTO FATURA", type = ImportRowType.CARD_PAYMENT, categoryId = null, invoiceId = null),
        )
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()

        viewModel.confirm()
        advanceUntilIdle()

        assertEquals(setOf("t1", "p1"), viewModel.uiState.value.rowErrors.keys)
        assertTrue(imports.confirmed.isEmpty())
        assertFalse(viewModel.uiState.value.confirming)

        viewModel.onChoice("t1") { it.copy(targetAccountId = "acc-2") }
        viewModel.onChoice("p1") { it.copy(import = false) }
        assertTrue(viewModel.uiState.value.rowErrors.isEmpty())
        viewModel.confirm()
        advanceUntilIdle()

        assertEquals(1, imports.confirmed.size)
    }

    @Test
    fun `falha de rede ao confirmar mostra erro e mantem a revisao`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()
        imports.failure = IOException("offline")

        viewModel.confirm()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))
        assertNotNull(viewModel.uiState.value.review)
        assertNull(viewModel.uiState.value.result)
    }

    @Test
    fun `descartar cancela no servidor e volta a tela inicial`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.upload("x.csv", "a;b")
        advanceUntilIdle()

        viewModel.discard()
        advanceUntilIdle()

        assertEquals(listOf("imp-1"), imports.cancelled)
        assertNull(viewModel.uiState.value.review)
    }

    @Test
    fun `tipos permitidos respeitam o sentido do dinheiro`() {
        assertEquals(
            listOf(ImportRowType.EXPENSE, ImportRowType.TRANSFER, ImportRowType.CARD_PAYMENT),
            importRow(incoming = false).allowedTypes,
        )
        assertEquals(
            listOf(ImportRowType.INCOME, ImportRowType.TRANSFER),
            importRow(incoming = true, type = ImportRowType.INCOME).allowedTypes,
        )
    }
}
