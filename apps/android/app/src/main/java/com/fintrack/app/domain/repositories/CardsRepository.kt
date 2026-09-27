package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.NewCard
import com.fintrack.app.domain.models.NewPurchase
import com.fintrack.app.domain.models.Purchase

/** O servidor divide as parcelas, escolhe as faturas e calcula limite e valores; o app só exibe. */
interface CardsRepository {
    suspend fun cards(): List<CreditCard>

    suspend fun card(id: String): CreditCard

    suspend fun createCard(input: NewCard): CreditCard

    suspend fun invoices(cardId: String): List<InvoiceSummary>

    suspend fun invoice(id: String): InvoiceDetail

    /** Paga (ou agenda, se a data for futura) a fatura. Sai da conta, mas não é despesa. */
    suspend fun payInvoice(invoiceId: String, accountId: String, amountCents: Long, date: String)

    suspend fun purchases(cardId: String): List<Purchase>

    suspend fun createPurchase(cardId: String, input: NewPurchase)

    suspend fun cancelPurchase(id: String)
}
