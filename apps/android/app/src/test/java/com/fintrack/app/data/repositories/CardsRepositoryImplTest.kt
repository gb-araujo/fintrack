package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.CardsApi
import com.fintrack.app.domain.models.InvoiceStatus
import com.fintrack.app.domain.models.NewCard
import com.fintrack.app.domain.models.NewPurchase
import com.fintrack.app.domain.models.TransactionStatus
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class CardsRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: CardsRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = CardsRepositoryImpl(retrofit.create(CardsApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private val invoice =
        """{"id":"i1","creditCardId":"c1","referenceMonth":"2026-10","closingDate":"2026-09-28","dueDate":"2026-10-05","status":"closed","overdue":false,"totalCents":90000,"paidCents":30000,"scheduledCents":10000,"remainingCents":60000}"""

    private val card =
        """{"id":"c1","name":"Nubank","limitCents":500000,"closingDay":28,"dueDay":5,"paymentAccountId":null,"archivedAt":null,"usedLimitCents":90000,"availableLimitCents":410000,"openInvoice":$invoice,"createdAt":"2026-09-27T00:00:00.000Z"}"""

    @Test
    fun `lista cartoes com limite e fatura aberta`() = runTest {
        json(200, """{"items":[$card]}""")

        val cards = repository.cards()

        assertEquals("/api/v1/credit-cards", server.takeRequest().url.encodedPath)
        val first = cards.single()
        assertEquals(410_000L, first.availableLimitCents)
        assertNull(first.paymentAccountId)
        assertEquals(false, first.archived)
        assertEquals(InvoiceStatus.CLOSED, first.openInvoice?.status)
        assertEquals(50_000L, first.openInvoice?.payableCents)
    }

    @Test
    fun `cadastrar cartao envia limite em centavos e dias`() = runTest {
        json(201, card)

        repository.createCard(NewCard("Nubank", 500_000, 28, 5, "acc-1"))

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        val body = request.body!!.utf8()
        assertTrue(body.contains("\"limitCents\":500000"))
        assertTrue(body.contains("\"closingDay\":28"))
        assertTrue(body.contains("\"dueDay\":5"))
        assertTrue(body.contains("\"paymentAccountId\":\"acc-1\""))
    }

    @Test
    fun `detalhe da fatura converte parcelas e pagamentos`() = runTest {
        json(
            200,
            """{"id":"i1","creditCardId":"c1","referenceMonth":"2026-10","closingDate":"2026-09-28","dueDate":"2026-10-05","status":"closed","overdue":true,"totalCents":90000,"paidCents":30000,"scheduledCents":10000,"remainingCents":60000,"cardName":"Nubank","installments":[{"purchaseId":"p1","description":"Notebook","purchaseDate":"2026-09-20","categoryId":null,"installmentNumber":1,"installmentsCount":3,"amountCents":30000}],"payments":[{"id":"t1","accountId":"a1","amountCents":30000,"date":"2026-10-01","status":"completed"},{"id":"t2","accountId":"a1","amountCents":10000,"date":"2026-10-04","status":"pending"}]}""",
        )

        val detail = repository.invoice("i1")

        assertEquals("/api/v1/invoices/i1", server.takeRequest().url.encodedPath)
        assertEquals("Nubank", detail.cardName)
        assertTrue(detail.summary.overdue)
        assertEquals(1, detail.installments.size)
        assertEquals(30_000L, detail.installments[0].amountCents)
        assertEquals(TransactionStatus.PENDING, detail.payments[1].status)
        assertEquals(50_000L, detail.summary.payableCents)
    }

    @Test
    fun `pagar fatura envia conta, valor em centavos e data`() = runTest {
        json(
            201,
            """{"id":"t1","accountId":"a1","categoryId":null,"type":"card_payment","amountCents":25050,"description":"Fatura Nubank 10/2026","transactionDate":"2026-09-27","status":"completed","transfer":null}""",
        )

        repository.payInvoice("i1", "a1", 25_050, "2026-09-27")

        val request = server.takeRequest()
        assertEquals("/api/v1/invoices/i1/payments", request.url.encodedPath)
        val body = request.body!!.utf8()
        assertTrue(body.contains("\"accountId\":\"a1\""))
        assertTrue(body.contains("\"amountCents\":25050"))
        assertTrue(body.contains("\"paymentDate\":\"2026-09-27\""))
    }

    @Test
    fun `lanca compra e cancela compra`() = runTest {
        val purchase =
            """{"id":"p1","creditCardId":"c1","description":"Notebook","purchaseDate":"2026-09-20","totalAmountCents":90000,"installmentsCount":3,"categoryId":null,"cancelled":false,"installments":[],"createdAt":"2026-09-27T00:00:00.000Z"}"""
        json(201, purchase)
        json(200, purchase.replace("\"cancelled\":false", "\"cancelled\":true"))

        repository.createPurchase("c1", NewPurchase("Notebook", "2026-09-20", 90_000, 3, "cat-1"))
        repository.cancelPurchase("p1")

        val create = server.takeRequest()
        assertEquals("/api/v1/credit-cards/c1/purchases", create.url.encodedPath)
        val body = create.body!!.utf8()
        assertTrue(body.contains("\"totalAmountCents\":90000"))
        assertTrue(body.contains("\"installmentsCount\":3"))
        assertTrue(body.contains("\"categoryId\":\"cat-1\""))
        assertEquals("/api/v1/purchases/p1/cancel", server.takeRequest().url.encodedPath)
    }

    @Test
    fun `lista compras e faturas`() = runTest {
        json(
            200,
            """{"items":[{"id":"p1","creditCardId":"c1","description":"Notebook","purchaseDate":"2026-09-20","totalAmountCents":90000,"installmentsCount":3,"categoryId":null,"cancelled":true,"installments":[],"createdAt":"x"}]}""",
        )
        json(200, """{"items":[$invoice]}""")

        val purchases = repository.purchases("c1")
        val invoices = repository.invoices("c1")

        assertTrue(purchases.single().cancelled)
        assertEquals("2026-10", invoices.single().referenceMonth)
        assertNotNull(server.takeRequest())
    }

    @Test
    fun `erro de regra do servidor vira ApiException com a mensagem`() = runTest {
        json(422, """{"error":{"code":"BUSINESS_RULE","message":"O valor passa do que resta pagar da fatura (R${'$'} 900,00)."}}""")

        try {
            repository.payInvoice("i1", "a1", 999_999, "2026-09-27")
            fail("esperava ApiException")
        } catch (error: ApiException) {
            assertEquals(422, error.statusCode)
            assertTrue(error.message.contains("passa do que resta pagar"))
        }
    }
}
