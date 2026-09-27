package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.LedgerApi
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.NewTransaction
import com.fintrack.app.domain.models.NewTransfer
import com.fintrack.app.domain.models.TransactionFilters
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class LedgerRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: LedgerRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = LedgerRepositoryImpl(retrofit.create(LedgerApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private val account =
        """{"id":"a1","name":"Banco Inter","type":"bank","initialBalanceCents":120000,"balanceCents":426364,"includeInAvailable":true,"archivedAt":null,"createdAt":"2026-09-27T00:00:00.000Z"}"""

    @Test
    fun `lista contas e converte saldo em centavos e tipo`() = runTest {
        json(200, """{"items":[$account]}""")

        val accounts = repository.accounts()

        assertEquals(1, accounts.size)
        assertEquals(426_364L, accounts[0].balanceCents)
        assertEquals(AccountType.BANK, accounts[0].type)
        assertFalse(accounts[0].archived)
        val request = server.takeRequest()
        assertEquals("/api/v1/accounts", request.url.encodedPath)
        assertEquals("false", request.url.queryParameter("includeArchived"))
    }

    @Test
    fun `cria conta de investimento fora do disponivel`() = runTest {
        json(201, account.replace("\"bank\"", "\"investment\""))

        repository.createAccount("Tesouro", AccountType.INVESTMENT, 0)

        val body = server.takeRequest().body!!.utf8()
        assertTrue(body.contains("\"type\":\"investment\""))
        assertTrue(body.contains("\"includeInAvailable\":false"))
        assertTrue(body.contains("\"initialBalanceCents\":0"))
    }

    @Test
    fun `lista lancamentos com filtros e cursor e converte pernas de transferencia`() = runTest {
        json(
            200,
            """{"items":[{"id":"t1","accountId":"a1","categoryId":null,"type":"transfer","amountCents":30000,"description":"","transactionDate":"2026-09-20","paymentMethod":null,"status":"pending","transfer":{"id":"tr1","direction":"out","fromAccountId":"a1","toAccountId":"a2"},"createdAt":"x","updatedAt":"x"}],"nextCursor":"abc"}""",
        )

        val page = repository.transactions(TransactionFilters(accountId = "a1", type = TransactionType.TRANSFER, status = TransactionStatus.PENDING), cursor = "c1")

        val leg = page.items.single()
        assertEquals(-30_000L, leg.signedAmountCents)
        assertEquals("tr1", leg.transfer?.id)
        assertEquals(TransactionStatus.PENDING, leg.status)
        assertEquals("abc", page.nextCursor)
        val url = server.takeRequest().url
        assertEquals("c1", url.queryParameter("cursor"))
        assertEquals("a1", url.queryParameter("accountId"))
        assertEquals("transfer", url.queryParameter("type"))
        assertEquals("pending", url.queryParameter("status"))
    }

    @Test
    fun `cria lancamento sem status quando efetivado e com pending quando pendente`() = runTest {
        json(201, """{"id":"t","accountId":"a1","type":"expense","amountCents":100,"description":"","transactionDate":"2026-09-27","status":"completed"}""")
        json(201, """{"id":"t","accountId":"a1","type":"expense","amountCents":100,"description":"","transactionDate":"2026-09-27","status":"pending"}""")

        repository.createTransaction(NewTransaction("a1", TransactionType.EXPENSE, null, 9_099, "Vivo", "2026-09-27", pending = false))
        repository.createTransaction(NewTransaction("a1", TransactionType.EXPENSE, "c1", 9_099, "Vivo", "2026-09-27", pending = true))

        val first = server.takeRequest().body!!.utf8()
        val second = server.takeRequest().body!!.utf8()
        assertFalse(first.contains("status"))
        assertTrue(first.contains("\"amountCents\":9099"))
        assertFalse(first.contains("categoryId"))
        assertTrue(second.contains("\"status\":\"pending\""))
        assertTrue(second.contains("\"categoryId\":\"c1\""))
    }

    @Test
    fun `transferencia e efetivar cancelar usam as rotas certas`() = runTest {
        json(201, """{"id":"tr1"}""")
        json(200, """{"id":"tr1"}""")
        json(200, """{"id":"tr1"}""")
        json(200, """{"id":"t","accountId":"a1","type":"expense","amountCents":1,"description":"","transactionDate":"2026-09-27","status":"completed"}""")

        repository.createTransfer(NewTransfer("a1", "a2", 30_000, "2026-09-27", "Saldo", pending = false))
        repository.completeTransfer("tr1", "2026-09-27")
        repository.cancelTransfer("tr1")
        repository.completeTransaction("t", null)

        val create = server.takeRequest()
        assertEquals("/api/v1/transfers", create.url.encodedPath)
        assertTrue(create.body!!.utf8().contains("\"transferDate\":\"2026-09-27\""))
        val complete = server.takeRequest()
        assertEquals("/api/v1/transfers/tr1/complete", complete.url.encodedPath)
        assertTrue(complete.body!!.utf8().contains("\"transactionDate\":\"2026-09-27\""))
        assertEquals("/api/v1/transfers/tr1/cancel", server.takeRequest().url.encodedPath)
        val plain = server.takeRequest()
        assertEquals("/api/v1/transactions/t/complete", plain.url.encodedPath)
        assertNull(plain.body!!.utf8().takeIf { it.contains("transactionDate") })
    }

    @Test
    fun `erro 422 da API vira ApiException com o codigo e a mensagem`() = runTest {
        json(422, """{"error":{"code":"BUSINESS_RULE_VIOLATION","message":"Não é possível efetivar com data futura."}}""")

        try {
            repository.completeTransaction("t", null)
            fail("deveria lançar ApiException")
        } catch (e: ApiException) {
            assertEquals(422, e.statusCode)
            assertEquals("BUSINESS_RULE_VIOLATION", e.code)
            assertEquals("Não é possível efetivar com data futura.", e.message)
        }
    }
}
