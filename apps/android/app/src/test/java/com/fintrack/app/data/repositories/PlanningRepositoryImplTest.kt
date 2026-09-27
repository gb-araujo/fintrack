package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.PlanningApi
import com.fintrack.app.domain.models.BudgetStatus
import com.fintrack.app.domain.models.TransactionType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class PlanningRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: PlanningRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = PlanningRepositoryImpl(retrofit.create(PlanningApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    @Test
    fun `orcamentos do mes convertem valores e status`() = runTest {
        json(
            200,
            """{"month":"2026-09","items":[{"id":"b1","categoryId":"c1","categoryName":"Alimentação","month":"2026-09","limitCents":80000,"spentCents":20000,"pendingCents":3000,"remainingCents":60000,"percentUsed":25,"status":"ok"},{"id":"b2","categoryId":"c2","categoryName":"Lazer","month":"2026-09","limitCents":40000,"spentCents":52000,"pendingCents":0,"remainingCents":-12000,"percentUsed":130,"status":"exceeded"}],"totals":{"limitCents":120000,"spentCents":72000,"remainingCents":48000},"unbudgetedSpentCents":13000}""",
        )

        val summary = repository.budgets("2026-09")

        assertEquals("2026-09", server.takeRequest().url.queryParameter("month"))
        assertEquals(48_000L, summary.remainingCents)
        assertEquals(13_000L, summary.unbudgetedSpentCents)
        assertEquals(BudgetStatus.OK, summary.items[0].status)
        assertEquals(3_000L, summary.items[0].pendingCents)
        assertEquals(BudgetStatus.EXCEEDED, summary.items[1].status)
        assertEquals(-12_000L, summary.items[1].remainingCents)
        assertEquals(130, summary.items[1].percentUsed)
    }

    @Test
    fun `salvar orcamento faz PUT com categoria, mes e limite em centavos`() = runTest {
        json(
            200,
            """{"id":"b1","categoryId":"c1","categoryName":"Alimentação","month":"2026-09","limitCents":35000,"spentCents":0,"pendingCents":0,"remainingCents":35000,"percentUsed":0,"status":"ok"}""",
        )

        val saved = repository.saveBudget("c1", "2026-09", 35_000)

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/api/v1/budgets", request.url.encodedPath)
        val body = request.body!!.utf8()
        assertTrue(body.contains("\"categoryId\":\"c1\""))
        assertTrue(body.contains("\"month\":\"2026-09\""))
        assertTrue(body.contains("\"limitCents\":35000"))
        assertEquals(35_000L, saved.limitCents)
    }

    @Test
    fun `previsoes de recorrencias convertem tipo, estimativa e atraso`() = runTest {
        json(
            200,
            """{"from":"2026-07-27","until":"2026-11-25","items":[{"recurringId":"r1","name":"Aluguel","type":"expense","date":"2026-09-25","amountCents":150000,"estimated":false,"accountId":"a1","categoryId":null,"overdue":true},{"recurringId":"r2","name":"Salário","type":"income","date":"2026-10-05","amountCents":500000,"estimated":true,"accountId":"a1","categoryId":null,"overdue":false}]}""",
        )

        val items = repository.occurrences()

        assertEquals("/api/v1/recurring/occurrences", server.takeRequest().url.encodedPath)
        assertEquals(TransactionType.EXPENSE, items[0].type)
        assertTrue(items[0].overdue)
        assertEquals(TransactionType.INCOME, items[1].type)
        assertTrue(items[1].estimated)
        assertEquals("r1|2026-09-25", items[0].key)
    }

    @Test
    fun `confirmar envia valor e data e usa a data da ocorrencia no caminho`() = runTest {
        json(
            201,
            """{"id":"t1","accountId":"a1","categoryId":null,"type":"expense","amountCents":19550,"description":"Enel","transactionDate":"2026-09-27","status":"completed","transfer":null}""",
        )

        repository.confirmOccurrence("r2", "2026-10-05", 19_550, "2026-09-27")

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertEquals("/api/v1/recurring/r2/occurrences/2026-10-05/confirm", request.url.encodedPath)
        val body = request.body!!.utf8()
        assertTrue(body.contains("\"amountCents\":19550"))
        assertTrue(body.contains("\"transactionDate\":\"2026-09-27\""))
    }

    @Test
    fun `pular faz POST no caminho da ocorrencia`() = runTest {
        json(
            201,
            """{"id":"t1","accountId":"a1","categoryId":null,"type":"expense","amountCents":150000,"description":"Aluguel","transactionDate":"2026-09-25","status":"cancelled","transfer":null}""",
        )

        repository.skipOccurrence("r1", "2026-09-25")

        assertEquals("/api/v1/recurring/r1/occurrences/2026-09-25/skip", server.takeRequest().url.encodedPath)
    }

    @Test
    fun `conflito da API vira ApiException com a mensagem do servidor`() = runTest {
        json(409, """{"error":{"code":"CONFLICT","message":"Esta ocorrência já foi confirmada ou pulada."}}""")

        try {
            repository.confirmOccurrence("r1", "2026-09-25", 100, "2026-09-25")
            fail("esperava ApiException")
        } catch (error: ApiException) {
            assertEquals(409, error.statusCode)
            assertEquals("Esta ocorrência já foi confirmada ou pulada.", error.message)
        }
    }
}
