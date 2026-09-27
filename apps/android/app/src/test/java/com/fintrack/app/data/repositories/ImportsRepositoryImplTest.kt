package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.core.utils.decodeStatement
import com.fintrack.app.data.api.ImportsApi
import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportRowType
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

/** Pilha real de rede (Retrofit + OkHttp + kotlinx.serialization) contra um servidor HTTP local. */
@OptIn(ExperimentalCoroutinesApi::class)
class ImportsRepositoryImplTest {

    private lateinit var server: MockWebServer
    private lateinit var repository: ImportsRepositoryImpl

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        val retrofit = NetworkModule.retrofit(server.url("/").toString(), NetworkModule.okHttpClient(enableLogging = false))
        repository = ImportsRepositoryImpl(retrofit.create(ImportsApi::class.java), UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        server.close()
    }

    private fun json(code: Int, body: String) =
        server.enqueue(MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build())

    private val detail =
        """{"id":"i1","accountId":"a1","source":"csv","filename":"extrato.csv","status":"review","rowsCount":2,"importedCount":0,"skippedCount":0,"createdAt":"x","confirmedAt":null,"detected":{"delimiter":";","headers":["Data"],"mapping":{}},"ignoredRows":[{"line":9,"reason":"Valor zero."}],"ignoredRowsCount":1,"rows":[{"id":"r1","rowNumber":6,"date":"2026-09-05","amountCents":9099,"direction":"out","description":"TELEFONICA BRAS","normalizedDescription":"TELEFONICA BRAS","suggestedType":"expense","suggestedCategoryId":"c1","suggestedTargetAccountId":null,"suggestedInvoiceId":null,"suggestionSource":"default_rule","duplicate":null,"defaultAction":"import","status":"pending"},{"id":"r2","rowNumber":7,"date":"2026-09-02","amountCents":30000,"direction":"out","description":"PIX ENVIADO MERCADO PAGO","normalizedDescription":"PIX ENVIADO MERCADO PAGO","suggestedType":"transfer","suggestedCategoryId":null,"suggestedTargetAccountId":"a2","suggestedInvoiceId":null,"suggestionSource":"own_account","duplicate":{"kind":"possible","transactionId":"t9"},"defaultAction":"skip","status":"pending"}]}"""

    @Test
    fun `enviar o extrato converte linhas, sugestoes e duplicatas`() = runTest {
        json(201, detail)

        val review = repository.create("a1", "extrato.csv", "Data;Descrição;Valor\n1;2;3")

        val request = server.takeRequest()
        assertEquals("/api/v1/imports", request.url.encodedPath)
        val body = request.body!!.utf8()
        assertTrue(body.contains("\"accountId\":\"a1\""))
        assertTrue(body.contains("\"filename\":\"extrato.csv\""))
        assertTrue(body.contains("\"content\":"))
        assertEquals(2, review.rows.size)
        assertEquals(9_099L, review.rows[0].amountCents)
        assertFalse(review.rows[0].incoming)
        assertEquals(ImportRowType.EXPENSE, review.rows[0].suggestedType)
        assertEquals("c1", review.rows[0].suggestedCategoryId)
        assertEquals(ImportRowType.TRANSFER, review.rows[1].suggestedType)
        assertEquals("a2", review.rows[1].suggestedTargetAccountId)
        assertEquals("possible", review.rows[1].duplicateKind)
        assertFalse(review.rows[1].defaultImport)
        assertEquals(listOf("Linha 9: Valor zero."), review.ignoredSample)
    }

    @Test
    fun `confirmar envia uma decisao por linha, com categoria nula explicita quando o usuario limpa`() = runTest {
        json(200, """{"importId":"i1","imported":1,"skipped":1,"transfers":0,"cardPayments":0,"rulesSaved":1}""")
        val choices = linkedMapOf(
            "r1" to ImportChoice(import = true, type = ImportRowType.EXPENSE, categoryId = null, targetAccountId = null, invoiceId = null, saveRule = true),
            "r2" to ImportChoice(import = false, type = ImportRowType.TRANSFER, categoryId = null, targetAccountId = "a2", invoiceId = null),
        )

        val result = repository.confirm("i1", choices)

        val request = server.takeRequest()
        assertEquals("/api/v1/imports/i1/confirm", request.url.encodedPath)
        val body = request.body!!.utf8()
        // Categoria "sem categoria" precisa ir como null EXPLÍCITO (ausente = usar a sugestão do servidor).
        assertTrue(body.contains("\"categoryId\":null"))
        assertTrue(body.contains("\"saveRule\":true"))
        assertTrue(body.contains("\"rowId\":\"r2\",\"action\":\"skip\""))
        assertEquals(1, result.imported)
        assertEquals(1, result.rulesSaved)
    }

    @Test
    fun `decisao de transferencia e de pagamento de fatura levam a conta e a fatura, sem categoria`() = runTest {
        json(200, """{"importId":"i1","imported":2,"skipped":0,"transfers":1,"cardPayments":1,"rulesSaved":0}""")

        repository.confirm(
            "i1",
            linkedMapOf(
                "r1" to ImportChoice(true, ImportRowType.TRANSFER, "c1", "a2", "inv-9"),
                "r2" to ImportChoice(true, ImportRowType.CARD_PAYMENT, "c1", "a2", "inv-1", saveRule = true),
            ),
        )

        val body = server.takeRequest().body!!.utf8()
        assertTrue(body.contains("\"type\":\"transfer\",\"targetAccountId\":\"a2\""))
        assertTrue(body.contains("\"type\":\"card_payment\",\"invoiceId\":\"inv-1\""))
        assertFalse(body.contains("categoryId"))
        assertFalse(body.contains("saveRule")) // pagamento de fatura nunca salva regra
        assertFalse(body.contains("inv-9")) // fatura só vale para pagamento de fatura
    }

    @Test
    fun `lista faturas a pagar e cancela a revisao`() = runTest {
        json(
            200,
            """{"items":[{"id":"inv-1","creditCardId":"c","referenceMonth":"2026-10","closingDate":"x","dueDate":"y","status":"closed","overdue":false,"totalCents":90000,"paidCents":0,"scheduledCents":0,"remainingCents":90000,"cardName":"Nubank","payableCents":90000}]}""",
        )
        json(200, detail)

        val invoices = repository.payableInvoices()
        repository.cancel("i1")

        assertEquals("Nubank", invoices.single().cardName)
        assertEquals(90_000L, invoices.single().payableCents)
        assertEquals("/api/v1/invoices/payable", server.takeRequest().url.encodedPath)
        assertEquals("/api/v1/imports/i1/cancel", server.takeRequest().url.encodedPath)
    }

    @Test
    fun `erro de regra do servidor vira ApiException com a mensagem`() = runTest {
        json(422, """{"error":{"code":"BUSINESS_RULE_VIOLATION","message":"Linha 6: A conta está arquivada."}}""")

        try {
            repository.confirm("i1", emptyMap())
            fail("esperava ApiException")
        } catch (error: ApiException) {
            assertEquals(422, error.statusCode)
            assertTrue(error.message.startsWith("Linha 6"))
        }
    }

    @Test
    fun `decodeStatement le UTF-8 e cai para Windows-1252`() {
        assertEquals("Descrição;Valor", decodeStatement("Descrição;Valor".toByteArray(Charsets.UTF_8)))
        // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3 (inválidos como UTF-8).
        val legacy = byteArrayOf(0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xE7.toByte(), 0xE3.toByte(), 0x6F)
        assertEquals("Descrição", decodeStatement(legacy))
    }
}
