package com.fintrack.app.data.session

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.AuthApi
import com.fintrack.app.data.api.UsersApi
import com.fintrack.app.data.repositories.AuthRepositoryImpl
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.testing.InMemoryTokenStorage
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.Timeout

/**
 * Fluxo de sessão do Android com a pilha de rede real contra um servidor HTTP local que imita a
 * API FINTRACK (rotação de refresh token, 401 em access token expirado, envelope de erro).
 */
class SessionFlowTest {

    /** Um deadlock deve falhar o teste rapidamente, não travar o build. */
    @get:Rule
    val timeout: Timeout = Timeout.seconds(30)

    private lateinit var server: MockWebServer
    private lateinit var storage: InMemoryTokenStorage
    private lateinit var sessionManager: SessionManager
    private lateinit var repository: AuthRepositoryImpl
    private lateinit var usersApi: UsersApi
    private val fakeApi = FakeFintrackApi()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.dispatcher = fakeApi
        server.start()
        storage = InMemoryTokenStorage()
        val baseUrl = server.url("/").toString()
        val base = NetworkModule.okHttpClient(enableLogging = false)
        val authApi = NetworkModule.retrofit(baseUrl, base).create(AuthApi::class.java)
        sessionManager = SessionManager(authApi, storage)
        repository = AuthRepositoryImpl(authApi, sessionManager)
        usersApi = NetworkModule.retrofit(baseUrl, NetworkModule.authenticatedClient(base, sessionManager))
            .create(UsersApi::class.java)
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun me() = runBlocking { withContext(Dispatchers.IO) { apiCall { usersApi.me() } } }

    @Test
    fun `login guarda o refresh token, autentica e identifica o cliente como android`() = runBlocking {
        repository.login("gabriel@exemplo.com", "senha-segura")

        assertEquals("refresh-1", storage.token)
        assertTrue(sessionManager.state.value is SessionState.Authenticated)
        assertEquals("access-1", sessionManager.currentAccessToken())
        assertTrue(fakeApi.requests.all { it.headers["X-Client"] == "android" })
    }

    @Test
    fun `rotas autenticadas recebem o Bearer`() {
        runBlocking { repository.login("gabriel@exemplo.com", "senha-segura") }

        assertEquals("Gabriel Araujo", me().name)
        assertEquals("Bearer access-1", fakeApi.requests.last().headers["Authorization"])
    }

    @Test
    fun `access token expirado - renova uma vez e repete a requisição`() {
        runBlocking { repository.login("gabriel@exemplo.com", "senha-segura") }
        fakeApi.expireAccessToken()

        assertEquals("Gabriel Araujo", me().name)

        assertEquals(1, fakeApi.refreshCalls.get())
        assertEquals("refresh-2", storage.token)
        assertEquals("Bearer access-2", fakeApi.requests.last().headers["Authorization"])
    }

    @Test
    fun `vários 401 simultâneos geram UMA única renovação`() {
        runBlocking { repository.login("gabriel@exemplo.com", "senha-segura") }
        fakeApi.expireAccessToken()

        // 8 > 5 (limite padrão de requisições por host do OkHttp): cobre o cenário de deadlock.
        val names = runBlocking(Dispatchers.IO) {
            (1..8).map { async { apiCall { usersApi.me() }.name } }.awaitAll()
        }

        assertEquals(List(8) { "Gabriel Araujo" }, names)
        assertEquals(1, fakeApi.refreshCalls.get())
    }

    @Test
    fun `refresh recusado encerra a sessão local e devolve 401 sem loop`() {
        runBlocking { repository.login("gabriel@exemplo.com", "senha-segura") }
        fakeApi.expireAccessToken()
        fakeApi.revokeSession()

        try {
            me()
            fail("deveria lançar ApiException 401")
        } catch (e: ApiException) {
            assertEquals(401, e.statusCode)
        }

        assertEquals(SessionState.Unauthenticated, sessionManager.state.value)
        assertNull(storage.token)
        assertEquals(1, fakeApi.refreshCalls.get())
    }

    @Test
    fun `restaurar sem token salvo não chama a API`() = runBlocking {
        repository.restoreSession()

        assertEquals(SessionState.Unauthenticated, sessionManager.state.value)
        assertTrue(fakeApi.requests.isEmpty())
    }

    @Test
    fun `restaurar com token salvo renova a sessão`() = runBlocking {
        storage.token = "refresh-1"

        repository.restoreSession()

        assertTrue(sessionManager.state.value is SessionState.Authenticated)
        assertEquals("refresh-2", storage.token)
    }

    @Test
    fun `restaurar sem rede mantém o token salvo e informa que o servidor está inacessível`() = runBlocking {
        storage.token = "refresh-1"
        server.close()

        repository.restoreSession()

        assertTrue(sessionManager.state.value is SessionState.Unreachable)
        assertEquals("refresh-1", storage.token)
    }

    @Test
    fun `logout revoga na API e limpa a sessão local`() = runBlocking {
        repository.login("gabriel@exemplo.com", "senha-segura")

        repository.logout()

        assertEquals(SessionState.Unauthenticated, sessionManager.state.value)
        assertNull(storage.token)
        assertNull(sessionManager.currentAccessToken())
        val logoutRequest = fakeApi.requests.last()
        assertEquals("/api/v1/auth/logout", logoutRequest.url.encodedPath)
        assertTrue(logoutRequest.body!!.utf8().contains("refresh-1"))
    }

    @Test
    fun `logout limpa a sessão local mesmo sem rede`() = runBlocking {
        repository.login("gabriel@exemplo.com", "senha-segura")
        server.close()

        repository.logout()

        assertEquals(SessionState.Unauthenticated, sessionManager.state.value)
        assertNull(storage.token)
    }
}

/** Imita as regras da API: access tokens numerados, refresh rotativo e sessão revogável. */
private class FakeFintrackApi : Dispatcher() {
    val requests = CopyOnWriteArrayList<RecordedRequest>()
    val refreshCalls = AtomicInteger(0)

    @Volatile private var generation = 1
    @Volatile private var accessValid = true
    @Volatile private var sessionRevoked = false

    fun expireAccessToken() {
        accessValid = false
    }

    fun revokeSession() {
        sessionRevoked = true
    }

    private val user =
        """{"id":"4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77","name":"Gabriel Araujo","email":"gabriel@exemplo.com","timezone":"America/Sao_Paulo","currency":"BRL","createdAt":"2026-09-26T12:00:00.000Z"}"""

    private fun session(n: Int) =
        """{"user":$user,"accessToken":"access-$n","accessTokenExpiresAt":"2026-09-26T12:15:00.000Z","refreshToken":"refresh-$n","refreshTokenExpiresAt":"2026-10-26T12:00:00.000Z"}"""

    private fun json(code: Int, body: String) =
        MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build()

    private fun unauthorized() =
        json(401, """{"error":{"code":"UNAUTHORIZED","message":"Sessão inválida ou expirada."}}""")

    @Synchronized
    override fun dispatch(request: RecordedRequest): MockResponse {
        requests += request
        return when (request.url.encodedPath) {
            "/api/v1/auth/login", "/api/v1/auth/register" -> json(200, session(generation))
            "/api/v1/auth/refresh" -> {
                refreshCalls.incrementAndGet()
                val body = request.body?.utf8().orEmpty()
                if (sessionRevoked || !body.contains("refresh-$generation")) {
                    unauthorized()
                } else {
                    generation++
                    accessValid = true
                    json(200, session(generation))
                }
            }
            "/api/v1/auth/logout" -> MockResponse.Builder().code(204).build()
            "/api/v1/users/me" -> {
                val valid = accessValid && request.headers["Authorization"] == "Bearer access-$generation"
                if (valid) json(200, user) else unauthorized()
            }
            else -> json(404, """{"error":{"code":"NOT_FOUND","message":"Rota não encontrada."}}""")
        }
    }
}
