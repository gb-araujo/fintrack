package com.fintrack.app.domain.usecases

import com.fintrack.app.domain.validation.AuthField
import com.fintrack.app.domain.validation.ValidationException
import com.fintrack.app.testing.FakeAuthRepository
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthUseCasesTest {

    @Test
    fun `login normaliza o e-mail antes de chamar o repositório`() = runTest {
        val repository = FakeAuthRepository()

        LoginUseCase(repository)("  Gabriel@Exemplo.COM ", "senha").getOrThrow()

        assertEquals(listOf("gabriel@exemplo.com" to "senha"), repository.loginCalls)
    }

    @Test
    fun `login com campos inválidos não chama a API`() = runTest {
        val repository = FakeAuthRepository()

        val error = LoginUseCase(repository)("não-é-email", "").exceptionOrNull()

        assertTrue(error is ValidationException)
        val fields = (error as ValidationException).fieldErrors
        assertEquals("E-mail inválido.", fields[AuthField.EMAIL])
        assertEquals("Informe a senha.", fields[AuthField.PASSWORD])
        assertTrue(repository.loginCalls.isEmpty())
    }

    @Test
    fun `cadastro exige senha de 8 a 128 caracteres`() = runTest {
        val repository = FakeAuthRepository()
        val register = RegisterUseCase(repository) { "America/Sao_Paulo" }

        val short = register("Gabriel", "g@exemplo.com", "1234567").exceptionOrNull() as ValidationException
        val long = register("Gabriel", "g@exemplo.com", "x".repeat(129)).exceptionOrNull() as ValidationException

        assertEquals("A senha deve ter pelo menos 8 caracteres.", short.fieldErrors[AuthField.PASSWORD])
        assertEquals("A senha deve ter no máximo 128 caracteres.", long.fieldErrors[AuthField.PASSWORD])
        assertTrue(repository.registerCalls.isEmpty())
    }

    @Test
    fun `cadastro envia nome aparado, e-mail normalizado e fuso do dispositivo`() = runTest {
        val repository = FakeAuthRepository()

        RegisterUseCase(repository) { "America/Manaus" }("  Gabriel ", "G@Exemplo.com", "senha-segura")
            .getOrThrow()

        assertEquals(
            listOf(listOf("Gabriel", "g@exemplo.com", "senha-segura", "America/Manaus")),
            repository.registerCalls,
        )
    }

    @Test
    fun `cadastro exige nome`() = runTest {
        val error = RegisterUseCase(FakeAuthRepository()) { null }("   ", "g@exemplo.com", "senha-segura")
            .exceptionOrNull() as ValidationException

        assertEquals("Informe o nome.", error.fieldErrors[AuthField.NAME])
    }
}
