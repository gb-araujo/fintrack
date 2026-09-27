package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.InvestmentsApi
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class InvestmentsRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: InvestmentsRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = InvestmentsRepositoryImpl(retrofit.create(InvestmentsApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    @Test
    fun `lista converte saldo, aportado e rendimento`() = runTest {
        json(
            200,
            """{"items":[{"accountId":"i1","accountName":"CDB","institution":"Banco X","product":null,
                |"balanceCents":150000,"netContributedCents":145000,"latestValuationDate":"2026-09-20",
                |"totalYieldCents":5000,"totalYieldPercent":3.5}]}""".trimMargin(),
        )

        val items = repository.list()

        val request = server.takeRequest()
        assertEquals("/api/v1/investments", request.url.encodedPath)
        val item = items.single()
        assertEquals("CDB", item.accountName)
        assertEquals("Banco X", item.institution)
        assertEquals(5_000L, item.totalYieldCents)
        assertEquals(3.5, item.totalYieldPercent)
    }

    @Test
    fun `historico de avaliacoes envia o accountId no caminho`() = runTest {
        json(
            200,
            """{"items":[{"id":"v1","accountId":"i1","date":"2026-09-20","balanceCents":150000,
                |"note":null,"yieldCents":5000,"yieldPercent":5.0,"contributedCents":15000,
                |"createdAt":"2026-09-20T12:00:00.000Z"}]}""".trimMargin(),
        )

        val items = repository.valuations("i1")

        assertEquals("/api/v1/investments/i1/valuations", server.takeRequest().url.encodedPath)
        assertEquals(5_000L, items.single().yieldCents)
    }

    @Test
    fun `upsertValuation envia PUT com data, saldo e observacao`() = runTest {
        json(
            200,
            """{"id":"v1","accountId":"i1","date":"2026-09-27","balanceCents":200000,"note":"Extrato",
                |"yieldCents":null,"yieldPercent":null,"contributedCents":200000,
                |"createdAt":"2026-09-27T12:00:00.000Z"}""".trimMargin(),
        )

        val result = repository.upsertValuation("i1", "2026-09-27", 200_000, "Extrato")

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/api/v1/investments/i1/valuations", request.url.encodedPath)
        assertEquals(
            """{"date":"2026-09-27","balanceCents":200000,"note":"Extrato"}""",
            request.body!!.utf8(),
        )
        assertEquals(200_000L, result.balanceCents)
    }

    @Test
    fun `deleteValuation trata 204 sem corpo como sucesso`() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())

        repository.deleteValuation("i1", "v1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/v1/investments/i1/valuations/v1", request.url.encodedPath)
    }

    @Test
    fun `deleteValuation propaga erro da API`() = runTest {
        json(409, """{"error":{"code":"CONFLICT","message":"A conta está arquivada."}}""")

        try {
            repository.deleteValuation("i1", "v1")
            fail("deveria lançar ApiException")
        } catch (error: ApiException) {
            assertEquals(409, error.statusCode)
            assertEquals("A conta está arquivada.", error.message)
        }
    }

    @Test
    fun `updateDetails envia PATCH com instituicao e produto`() = runTest {
        json(
            200,
            """{"accountId":"i1","accountName":"CDB","institution":"Banco X","product":"CDB 120% CDI",
                |"balanceCents":150000,"netContributedCents":150000,"latestValuationDate":null,
                |"totalYieldCents":null,"totalYieldPercent":null}""".trimMargin(),
        )

        val result = repository.updateDetails("i1", "Banco X", "CDB 120% CDI")

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("""{"institution":"Banco X","product":"CDB 120% CDI"}""", request.body!!.utf8())
        assertEquals("Banco X", result.institution)
        assertNull(result.latestValuationDate)
    }
}
