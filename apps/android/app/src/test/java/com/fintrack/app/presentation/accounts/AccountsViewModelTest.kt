package com.fintrack.app.presentation.accounts

import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.usecases.CreateAccountUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.testing.FakeLedgerRepository
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
class AccountsViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeLedgerRepository()

    private fun viewModel() = AccountsViewModel(ListAccountsUseCase(repository), CreateAccountUseCase(repository))

    @Test
    fun `lista as contas com o saldo vindo do servidor`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()

        assertEquals(listOf("Banco Inter", "Mercado Pago"), viewModel.uiState.value.accounts.map { it.name })
        assertEquals(false, viewModel.uiState.value.isLoading)
    }

    @Test
    fun `falha de rede mostra erro e permite tentar de novo`() = runTest {
        repository.failure = IOException("offline")
        val viewModel = viewModel()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.error!!.startsWith("Sem conexão"))

        repository.failure = null
        viewModel.refresh()
        advanceUntilIdle()

        assertNull(viewModel.uiState.value.error)
        assertEquals(2, viewModel.uiState.value.accounts.size)
    }

    @Test
    fun `criar conta valida, envia centavos, fecha o formulario e recarrega`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()
        viewModel.onFormChange { it.copy(name = "Nubank", type = AccountType.WALLET, balance = "1.250,50") }

        viewModel.submit()
        advanceUntilIdle()

        assertEquals(listOf(Triple("Nubank", AccountType.WALLET, 125_050L)), repository.createdAccounts)
        assertNull(viewModel.uiState.value.form)
    }

    @Test
    fun `formulario invalido mostra erros por campo e continua aberto`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()
        viewModel.onFormChange { it.copy(name = "", balance = "abc") }

        viewModel.submit()
        advanceUntilIdle()

        val form = viewModel.uiState.value.form!!
        assertEquals(setOf("name", "balance"), form.errors.keys)
        assertTrue(repository.createdAccounts.isEmpty())
        assertEquals(false, form.submitting)
    }

    @Test
    fun `digitar limpa os erros do formulario`() = runTest {
        val viewModel = viewModel()
        advanceUntilIdle()
        viewModel.openForm()
        viewModel.submit()
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value.form!!.errors.isNotEmpty())

        viewModel.onFormChange { it.copy(name = "N") }

        assertTrue(viewModel.uiState.value.form!!.errors.isEmpty())
    }
}
