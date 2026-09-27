package com.fintrack.app.testing

import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceInstallment
import com.fintrack.app.domain.models.InvoicePayment
import com.fintrack.app.domain.models.InvoiceStatus
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.NewCard
import com.fintrack.app.domain.models.NewPurchase
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.repositories.CardsRepository

fun invoice(
    id: String = "inv-1",
    month: String = "2026-10",
    status: InvoiceStatus = InvoiceStatus.CLOSED,
    total: Long = 90_000,
    paid: Long = 0,
    scheduled: Long = 0,
    overdue: Boolean = false,
) = InvoiceSummary(
    id = id,
    cardId = "card-1",
    referenceMonth = month,
    closingDate = "2026-09-28",
    dueDate = "$month-05",
    status = status,
    overdue = overdue,
    totalCents = total,
    paidCents = paid,
    scheduledCents = scheduled,
    remainingCents = total - paid,
)

fun creditCard(
    id: String = "card-1",
    name: String = "Nubank",
    used: Long = 90_000,
    limit: Long = 500_000,
    paymentAccountId: String? = "acc-1",
    openInvoice: InvoiceSummary? = null,
) = CreditCard(
    id = id,
    name = name,
    limitCents = limit,
    closingDay = 28,
    dueDay = 5,
    paymentAccountId = paymentAccountId,
    archived = false,
    usedLimitCents = used,
    availableLimitCents = limit - used,
    openInvoice = openInvoice,
)

fun purchase(id: String = "pur-1", description: String = "Notebook", installments: Int = 3, cancelled: Boolean = false) =
    Purchase(id, description, "2026-09-20", 90_000, installments, cancelled)

class FakeCardsRepository : CardsRepository {
    var cards: List<CreditCard> = listOf(creditCard())
    var invoices: List<InvoiceSummary> = listOf(invoice("inv-2", "2026-11", InvoiceStatus.OPEN, 30_000), invoice())
    var purchases: List<Purchase> = listOf(purchase(), purchase("pur-2", "Café", 1))
    var detail: (String) -> InvoiceDetail = { id ->
        InvoiceDetail(
            summary = invoices.first { it.id == id },
            cardName = "Nubank",
            installments = listOf(InvoiceInstallment("pur-1", "Notebook", "2026-09-20", 1, 3, 30_000)),
            payments = emptyList<InvoicePayment>(),
        )
    }
    var failure: Throwable? = null

    val createdCards = mutableListOf<NewCard>()
    val createdPurchases = mutableListOf<Pair<String, NewPurchase>>()
    val cancelledPurchases = mutableListOf<String>()
    val payments = mutableListOf<List<Any>>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun cards(): List<CreditCard> {
        maybeFail()
        return cards
    }

    override suspend fun card(id: String): CreditCard {
        maybeFail()
        return cards.first { it.id == id }
    }

    override suspend fun createCard(input: NewCard): CreditCard {
        maybeFail()
        createdCards += input
        return creditCard(name = input.name, limit = input.limitCents)
    }

    override suspend fun invoices(cardId: String): List<InvoiceSummary> {
        maybeFail()
        return invoices
    }

    override suspend fun invoice(id: String): InvoiceDetail {
        maybeFail()
        return detail(id)
    }

    override suspend fun payInvoice(invoiceId: String, accountId: String, amountCents: Long, date: String) {
        maybeFail()
        payments += listOf(invoiceId, accountId, amountCents, date)
    }

    override suspend fun purchases(cardId: String): List<Purchase> {
        maybeFail()
        return purchases
    }

    override suspend fun createPurchase(cardId: String, input: NewPurchase) {
        maybeFail()
        createdPurchases += cardId to input
    }

    override suspend fun cancelPurchase(id: String) {
        maybeFail()
        cancelledPurchases += id
    }
}
