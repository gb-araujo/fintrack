package com.fintrack.app.presentation.auth

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.usecases.LoginUseCase
import com.fintrack.app.testing.FakeAuthRepository
import com.fintrack.app.testing.MainDispatcherRule
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private val repository = FakeAuthRepository()
    private val viewModel = LoginViewModel(LoginUseCase(repository))

    @Test
    fun `mostra erros de validação por campo sem chamar a API`() = runTest {
        viewModel.submit()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Informe o e-mail.", state.emailError)
        assertEquals("Informe a senha.", state.passwordError)
        assertFalse(state.isSubmitting)
        assertTrue(repository.loginCalls.isEmpty())
    }

    @Test
    fun `digitar limpa o erro do campo`() = runTest {
        viewModel.submit()
        advanceUntilIdle()

        viewModel.onEmailChange("a")

        assertNull(viewModel.uiState.value.emailError)
    }

    @Test
    fun `login válido autentica a sessão e limpa a senha da memória da tela`() = runTest {
        viewModel.onEmailChange("gabriel@exemplo.com")
        viewModel.onPasswordChange("senha-segura")

        viewModel.submit()
        assertTrue(viewModel.uiState.value.isSubmitting)
        advanceUntilIdle()

        assertTrue(repository.sessionState.value is SessionState.Authenticated)
        assertEquals("", viewModel.uiState.value.password)
        assertFalse(viewModel.uiState.value.isSubmitting)
    }

    @Test
    fun `credenciais inválidas exibem a mensagem da API`() = runTest {
        repository.loginResult = { throw ApiException(401, "UNAUTHORIZED", "E-mail ou senha inválidos.") }
        viewModel.onEmailChange("gabriel@exemplo.com")
        viewModel.onPasswordChange("errada")

        viewModel.submit()
        advanceUntilIdle()

        assertEquals("E-mail ou senha inválidos.", viewModel.uiState.value.formError)
        assertFalse(viewModel.uiState.value.isSubmitting)
    }

    @Test
    fun `sem rede exibe mensagem de conexão`() = runTest {
        repository.loginResult = { throw IOException("offline") }
        viewModel.onEmailChange("gabriel@exemplo.com")
        viewModel.onPasswordChange("senha")

        viewModel.submit()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value.formError!!.startsWith("Sem conexão"))
    }

    @Test
    fun `cliques repetidos durante o envio fazem uma única chamada`() = runTest {
        viewModel.onEmailChange("gabriel@exemplo.com")
        viewModel.onPasswordChange("senha")

        viewModel.submit()
        viewModel.submit()
        viewModel.submit()
        advanceUntilIdle()

        assertEquals(1, repository.loginCalls.size)
    }
}
