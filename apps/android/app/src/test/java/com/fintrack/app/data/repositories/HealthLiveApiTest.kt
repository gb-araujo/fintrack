package com.fintrack.app.data.repositories

import com.fintrack.app.core.di.AppContainer
import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.apiCall
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.testing.InMemoryTokenStorage
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Testes de ponta a ponta contra a API real (local ou Railway), usando o mesmo AppContainer do app.
 * Só rodam com a variável FINTRACK_LIVE_API_URL definida, ex.:
 *   FINTRACK_LIVE_API_URL=http://localhost:3333/ ./gradlew testDebugUnitTest --tests "*LiveApi*"
 */
class HealthLiveApiTest {

    private lateinit var baseUrl: String

    @Before
    fun requireLiveApi() {
        val url = System.getenv("FINTRACK_LIVE_API_URL")
        assumeTrue("FINTRACK_LIVE_API_URL não definido — teste ignorado", !url.isNullOrBlank())
        baseUrl = url!!
    }

    private fun container(storage: InMemoryTokenStorage = InMemoryTokenStorage()) =
        AppContainer(baseUrl = baseUrl, enableHttpLogging = false, tokenStorage = storage)

    @Test
    fun `app consegue chamar GET health da API real`() {
        val health = runBlocking { container().checkApiHealth().getOrThrow() }

        println("[live] /health → healthy=${health.isHealthy} db=${health.databaseAvailable} v${health.version}")
        assertTrue("API deveria estar saudável", health.isHealthy)
    }

    @Test
    fun `fluxo de autenticação completo contra a API real`() = runBlocking(Dispatchers.IO) {
        val storage = InMemoryTokenStorage()
        val app = container(storage)
        val email = "android-${UUID.randomUUID()}@teste.fintrack.dev"

        // Cadastro → sessão autenticada com refresh token salvo
        val user = app.register("Teste Android", email, "senha-muito-segura").getOrThrow()
        assertEquals(email, user.email)
        assertTrue(app.observeSession().value is SessionState.Authenticated)
        val firstRefresh = storage.token!!

        // Rota autenticada
        assertEquals(email, apiCall { app.usersApi.me() }.email)

        // Renovação (rotação) e nova chamada autenticada
        val staleAccess = app.sessionManager.currentAccessToken()
        assertTrue(app.sessionManager.refreshAfterUnauthorized(staleAccess) != null)
        assertNotEquals(firstRefresh, storage.token)
        assertEquals(email, apiCall { app.usersApi.me() }.email)

        // Logout: sessão local limpa e refresh token revogado na API
        val lastRefresh = storage.token!!
        app.logout()
        assertNull(storage.token)
        storage.token = lastRefresh
        app.restoreSession()
        assertEquals(SessionState.Unauthenticated, app.observeSession().value)

        // Login com a mesma conta
        assertEquals(email, app.login(email.uppercase(), "senha-muito-segura").getOrThrow().email)
        val wrong = app.login(email, "senha-errada").exceptionOrNull()
        assertEquals(401, (wrong as ApiException).statusCode)
        println("[live] auth ok para $email")
    }
}
