package com.fintrack.app.data.repositories

import com.fintrack.app.core.di.AppContainer
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Teste de ponta a ponta contra a API real (local ou Railway), usando o mesmo AppContainer do app.
 * Só roda com a variável FINTRACK_LIVE_API_URL definida, ex.:
 *   FINTRACK_LIVE_API_URL=http://localhost:3333/ ./gradlew testDebugUnitTest
 */
class HealthLiveApiTest {

    @Test
    fun `app consegue chamar GET health da API real`() {
        val baseUrl = System.getenv("FINTRACK_LIVE_API_URL")
        assumeTrue("FINTRACK_LIVE_API_URL não definido — teste ignorado", !baseUrl.isNullOrBlank())

        val container = AppContainer(baseUrl = baseUrl!!, enableHttpLogging = false)
        val health = runBlocking { container.checkApiHealth().getOrThrow() }

        println("[live] /health → healthy=${health.isHealthy} db=${health.databaseAvailable} v${health.version}")
        assertTrue("API deveria estar saudável", health.isHealthy)
    }
}
