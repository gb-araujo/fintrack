package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.ReportsApi
import com.fintrack.app.domain.models.ReportPeriod
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class ReportsRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: ReportsRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = ReportsRepositoryImpl(retrofit.create(ReportsApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(body: String) =
        server.enqueue(MockResponse.Builder().code(200).addHeader("Content-Type", "application/json").body(body).build())

    private val period = """{"from":"2026-09-01","to":"2026-09-27"}"""

    @Test
    fun `despesas por categoria envia o periodo e converte os itens`() = runTest {
        json(
            """{"period":$period,"totalCents":40000,"items":[{"categoryId":"c1","categoryName":"Alimentação","totalCents":40000,"accountCents":30000,"cardCents":10000,"percent":100}]}""",
        )

        val report = repository.expensesByCategory(ReportPeriod(from = "2026-09-01", to = "2026-09-27"))

        val request = server.takeRequest()
        assertEquals("/api/v1/reports/expenses-by-category", request.url.encodedPath)
        assertEquals("2026-09-01", request.url.queryParameter("from"))
        assertEquals(40_000L, report.totalCents)
        assertEquals(10_000L, report.items.single().cardCents)
    }

    @Test
    fun `periodo vazio nao envia from nem to (o backend usa o mes corrente)`() = runTest {
        json("""{"period":$period,"totalCents":0,"items":[]}""")

        repository.expensesByCategory(ReportPeriod())

        val request = server.takeRequest()
        assertNull(request.url.queryParameter("from"))
        assertNull(request.url.queryParameter("to"))
    }

    @Test
    fun `evolucao mensal e patrimonio enviam months`() = runTest {
        json("""{"items":[{"month":"2026-09","incomeCents":100000,"expenseCents":50000,"cardExpenseCents":0,"netCents":50000}]}""")
        json("""{"items":[{"date":"2026-09-27","cashCents":100000,"investmentsCents":0,"cardLiabilitiesCents":0,"netWorthCents":100000}]}""")

        val evolution = repository.monthlyEvolution(6)
        val netWorth = repository.netWorth(6)

        assertEquals("6", server.takeRequest().url.queryParameter("months"))
        assertEquals("6", server.takeRequest().url.queryParameter("months"))
        assertEquals(50_000L, evolution.items.single().netCents)
        assertEquals(100_000L, netWorth.items.single().netWorthCents)
    }

    @Test
    fun `investimentos converte totais e contas`() = runTest {
        json(
            """{"period":$period,"totalBalanceCents":150000,"appliedCents":200000,"redeemedCents":50000,"items":[{"accountId":"i1","accountName":"CDB","balanceCents":150000,"appliedCents":200000,"redeemedCents":50000,"netContributedCents":150000}]}""",
        )

        val report = repository.investments(ReportPeriod())

        assertEquals(150_000L, report.totalBalanceCents)
        assertEquals("CDB", report.items.single().accountName)
    }

    @Test
    fun `fluxo de caixa converte todos os campos`() = runTest {
        json(
            """{"period":$period,"openingBalanceCents":100000,"closingBalanceCents":250000,"incomeCents":200000,"expensesCents":50000,"cardPaymentsCents":0,"transfersOutCents":0,"transfersInCents":0,"netCents":150000}""",
        )

        val report = repository.cashFlow(ReportPeriod())

        assertEquals(250_000L, report.closingBalanceCents)
        assertEquals(150_000L, report.netCents)
    }
}
