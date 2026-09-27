package com.fintrack.app.domain.usecases

import com.fintrack.app.domain.models.InvoiceStatus
import com.fintrack.app.testing.FakeCardsRepository
import com.fintrack.app.testing.invoice
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CardsUseCasesTest {

    private val repository = FakeCardsRepository()

    private fun validationErrors(result: Result<*>): Map<String, String> {
        val error = result.exceptionOrNull()
        assertTrue("esperava FormValidationException, veio $error", error is FormValidationException)
        return (error as FormValidationException).errors
    }

    @Test
    fun `cadastrar cartao envia limite em centavos e os dias`() = runTest {
        val result = CreateCardUseCase(repository)("Nubank", "5.000,00", "28", "5", "acc-1")

        assertTrue(result.isSuccess)
        val created = repository.createdCards.single()
        assertEquals(500_000L, created.limitCents)
        assertEquals(28, created.closingDay)
        assertEquals(5, created.dueDay)
        assertEquals("acc-1", created.paymentAccountId)
    }

    @Test
    fun `cadastrar cartao valida nome, limite e dias`() = runTest {
        val useCase = CreateCardUseCase(repository)

        assertEquals(
            setOf("name", "limit", "closingDay", "dueDay"),
            validationErrors(useCase("", "", "0", "32", null)).keys,
        )
        assertEquals(setOf("limit"), validationErrors(useCase("X", "abc", "1", "2", null)).keys)
        assertEquals(setOf("closingDay"), validationErrors(useCase("X", "10", "abc", "2", null)).keys)
        assertTrue(repository.createdCards.isEmpty())
    }

    @Test
    fun `compra parcelada envia o total e o numero de parcelas (o servidor divide)`() = runTest {
        val result = CreatePurchaseUseCase(repository)(
            cardId = "card-1",
            description = " Notebook ",
            amountText = "900,00",
            installmentsText = "3",
            date = "2026-09-27",
            categoryId = "cat-1",
            today = "2026-09-27",
        )

        assertTrue(result.isSuccess)
        val (cardId, purchase) = repository.createdPurchases.single()
        assertEquals("card-1", cardId)
        assertEquals("Notebook", purchase.description)
        assertEquals(90_000L, purchase.totalAmountCents)
        assertEquals(3, purchase.installmentsCount)
        assertEquals("cat-1", purchase.categoryId)
    }

    @Test
    fun `compra valida descricao, valor, parcelas e data futura`() = runTest {
        val useCase = CreatePurchaseUseCase(repository)

        assertEquals(
            setOf("description", "amount", "installments"),
            validationErrors(useCase("card-1", "", "", "0", "2026-09-27", null, "2026-09-27")).keys,
        )
        assertEquals(setOf("installments"), validationErrors(useCase("card-1", "X", "10", "49", "2026-09-27", null, "2026-09-27")).keys)
        assertEquals(setOf("date"), validationErrors(useCase("card-1", "X", "10", "1", "2026-09-28", null, "2026-09-27")).keys)
        assertEquals(setOf("date"), validationErrors(useCase("card-1", "X", "10", "1", "ontem", null, "2026-09-27")).keys)
        assertTrue(repository.createdPurchases.isEmpty())
    }

    @Test
    fun `pagar fatura exige conta, valor e data validos`() = runTest {
        val useCase = PayInvoiceUseCase(repository)

        assertEquals(setOf("account", "amount"), validationErrors(useCase("inv-1", null, "", "2026-09-27")).keys)
        assertEquals(setOf("date"), validationErrors(useCase("inv-1", "acc-1", "10,00", "27/09")).keys)
        assertTrue(useCase("inv-1", "acc-1", "250,50", "2026-09-27").isSuccess)
        assertEquals(listOf(listOf<Any>("inv-1", "acc-1", 25_050L, "2026-09-27")), repository.payments)
    }

    @Test
    fun `valor a pagar desconta o agendado e nunca e negativo`() {
        assertEquals(40_000L, invoice(total = 90_000, paid = 20_000, scheduled = 30_000).payableCents)
        assertEquals(0L, invoice(total = 10_000, paid = 50_000).payableCents)
        assertEquals(InvoiceStatus.CLOSED, invoice().status)
    }

    @Test
    fun `cancelar compra usa o id da compra`() = runTest {
        val result = CancelPurchaseUseCase(repository)(repository.purchases.first())

        assertTrue(result.isSuccess)
        assertEquals(listOf("pur-1"), repository.cancelledPurchases)
    }
}
