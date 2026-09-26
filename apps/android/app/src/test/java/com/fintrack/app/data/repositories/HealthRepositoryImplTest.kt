package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.HealthApi
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/**
 * Exercita a pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP
 * local que responde exatamente o contrato de GET /health da API.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class HealthRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: HealthRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(
            server.url("/").toString(),
            NetworkModule.okHttpClient(enableLogging = false),
        )
        repository = HealthRepositoryImpl(
            retrofit.create(HealthApi::class.java),
            ioDispatcher = UnconfinedTestDispatcher(),
        )
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun enqueueJson(code: Int, body: String) {
        server.enqueue(
            MockResponse.Builder()
                .code(code)
                .addHeader("Content-Type", "application/json")
                .body(body)
                .build(),
        )
    }

    @Test
    fun `chama GET health e converte o contrato`() = runTest {
        enqueueJson(
            200,
            """{"status":"ok","version":"0.0.0","uptimeSeconds":12,"timestamp":"2026-09-26T12:00:00.000Z","checks":{"database":"ok"},"campoNovo":true}""",
        )

        val health = repository.checkHealth()

        assertTrue(health.isHealthy)
        assertTrue(health.databaseAvailable)
        assertEquals("0.0.0", health.version)
        assertEquals(12L, health.uptimeSeconds)
        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/health", request.url.encodedPath)
    }

    @Test
    fun `503 com corpo de health vira estado degradado, não erro`() = runTest {
        enqueueJson(
            503,
            """{"status":"degraded","version":"0.0.0","uptimeSeconds":1,"timestamp":"2026-09-26T12:00:00.000Z","checks":{"database":"error"}}""",
        )

        val health = repository.checkHealth()

        assertFalse(health.isHealthy)
        assertFalse(health.databaseAvailable)
    }

    @Test
    fun `erro no envelope padrão vira ApiException`() = runTest {
        enqueueJson(429, """{"error":{"code":"RATE_LIMITED","message":"Muitas requisições."}}""")

        try {
            repository.checkHealth()
            fail("deveria lançar ApiException")
        } catch (e: ApiException) {
            assertEquals(429, e.statusCode)
            assertEquals("RATE_LIMITED", e.code)
        }
    }
}
