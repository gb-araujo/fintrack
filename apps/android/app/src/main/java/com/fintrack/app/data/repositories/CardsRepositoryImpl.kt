package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.CardsApi
import com.fintrack.app.data.models.CreateCardRequestDto
import com.fintrack.app.data.models.CreatePurchaseRequestDto
import com.fintrack.app.data.models.PayInvoiceRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.NewCard
import com.fintrack.app.domain.models.NewPurchase
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.repositories.CardsRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class CardsRepositoryImpl(
    private val api: CardsApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : CardsRepository {

    override suspend fun cards(): List<CreditCard> = withContext(ioDispatcher) {
        apiCall { api.cards() }.items.map { it.toDomain() }
    }

    override suspend fun card(id: String): CreditCard = withContext(ioDispatcher) {
        apiCall { api.card(id) }.toDomain()
    }

    override suspend fun createCard(input: NewCard): CreditCard = withContext(ioDispatcher) {
        apiCall {
            api.createCard(
                CreateCardRequestDto(
                    name = input.name,
                    limitCents = input.limitCents,
                    closingDay = input.closingDay,
                    dueDay = input.dueDay,
                    paymentAccountId = input.paymentAccountId,
                ),
            )
        }.toDomain()
    }

    override suspend fun invoices(cardId: String): List<InvoiceSummary> = withContext(ioDispatcher) {
        apiCall { api.invoices(cardId) }.items.map { it.toDomain() }
    }

    override suspend fun invoice(id: String): InvoiceDetail = withContext(ioDispatcher) {
        apiCall { api.invoice(id) }.toDomain()
    }

    override suspend fun payInvoice(invoiceId: String, accountId: String, amountCents: Long, date: String) {
        withContext(ioDispatcher) {
            apiCall { api.payInvoice(invoiceId, PayInvoiceRequestDto(accountId, amountCents, date)) }
        }
    }

    override suspend fun purchases(cardId: String): List<Purchase> = withContext(ioDispatcher) {
        apiCall { api.purchases(cardId) }.items.map { it.toDomain() }
    }

    override suspend fun createPurchase(cardId: String, input: NewPurchase) {
        withContext(ioDispatcher) {
            apiCall {
                api.createPurchase(
                    cardId,
                    CreatePurchaseRequestDto(
                        description = input.description,
                        purchaseDate = input.purchaseDate,
                        totalAmountCents = input.totalAmountCents,
                        installmentsCount = input.installmentsCount,
                        categoryId = input.categoryId,
                    ),
                )
            }
        }
    }

    override suspend fun cancelPurchase(id: String) {
        withContext(ioDispatcher) { apiCall { api.cancelPurchase(id) } }
    }
}
