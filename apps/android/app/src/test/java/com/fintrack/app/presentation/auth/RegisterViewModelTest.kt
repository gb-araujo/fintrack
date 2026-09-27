package com.fintrack.app.presentation.auth

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.usecases.RegisterUseCase
import com.fintrack.app.testing.FakeAuthRepository
import com.fintrack.app.testing.MainDispatcherRule
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class RegisterViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeAuthRepository()
    private val viewModel = RegisterViewModel(RegisterUseCase(repository) { "America/Sao_Paulo" })

    private fun fill(password: String = "senha-segura") {
        viewModel.onNameChange("Gabriel")
        viewModel.onEmailChange("g@exemplo.com")
        viewModel.onPasswordChange(password)
    }

    @Test
    fun `senha curta mostra erro no campo`() = runTest {
        fill(password = "123")

        viewModel.submit()
        advanceUntilIdle()

        assertEquals("A senha deve ter pelo menos 8 caracteres.", viewModel.uiState.value.passwordError)
        assertTrue(repository.registerCalls.isEmpty())
    }

    @Test
    fun `cadastro válido autentica a sessão`() = runTest {
        fill()

        viewModel.submit()
        advanceUntilIdle()

        assertTrue(repository.sessionState.value is SessionState.Authenticated)
        assertEquals(1, repository.registerCalls.size)
    }

    @Test
    fun `e-mail já cadastrado exibe a mensagem da API`() = runTest {
        repository.registerResult = { throw ApiException(409, "CONFLICT", "Este e-mail já está cadastrado.") }
        fill()

        viewModel.submit()
        advanceUntilIdle()

        assertEquals("Este e-mail já está cadastrado.", viewModel.uiState.value.formError)
    }
}
