package com.fintrack.app.data.models

import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceInstallment
import com.fintrack.app.domain.models.InvoicePayment
import com.fintrack.app.domain.models.InvoiceStatus
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.models.TransactionStatus
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts/credit-cards.ts. */
@Serializable
data class InvoiceSummaryDto(
    val id: String,
    val creditCardId: String,
    val referenceMonth: String,
    val closingDate: String,
    val dueDate: String,
    val status: String,
    val overdue: Boolean,
    val totalCents: Long,
    val paidCents: Long,
    val scheduledCents: Long,
    val remainingCents: Long,
)

@Serializable
data class CreditCardDto(
    val id: String,
    val name: String,
    val limitCents: Long,
    val closingDay: Int,
    val dueDay: Int,
    val paymentAccountId: String? = null,
    val archivedAt: String? = null,
    val usedLimitCents: Long,
    val availableLimitCents: Long,
    val openInvoice: InvoiceSummaryDto? = null,
)

@Serializable
data class CreditCardListDto(val items: List<CreditCardDto>)

@Serializable
data class CreateCardRequestDto(
    val name: String,
    val limitCents: Long,
    val closingDay: Int,
    val dueDay: Int,
    val paymentAccountId: String? = null,
)

@Serializable
data class PurchaseDto(
    val id: String,
    val description: String,
    val purchaseDate: String,
    val totalAmountCents: Long,
    val installmentsCount: Int,
    val cancelled: Boolean,
)

@Serializable
data class PurchaseListDto(val items: List<PurchaseDto>)

@Serializable
data class CreatePurchaseRequestDto(
    val description: String,
    val purchaseDate: String,
    val totalAmountCents: Long,
    val installmentsCount: Int,
    val categoryId: String? = null,
)

@Serializable
data class InvoiceListDto(val items: List<InvoiceSummaryDto>)

@Serializable
data class InvoiceInstallmentDto(
    val purchaseId: String,
    val description: String,
    val purchaseDate: String,
    val installmentNumber: Int,
    val installmentsCount: Int,
    val amountCents: Long,
)

@Serializable
data class InvoicePaymentDto(
    val id: String,
    val accountId: String,
    val amountCents: Long,
    val date: String,
    val status: String,
)

@Serializable
data class InvoiceDetailDto(
    val id: String,
    val creditCardId: String,
    val referenceMonth: String,
    val closingDate: String,
    val dueDate: String,
    val status: String,
    val overdue: Boolean,
    val totalCents: Long,
    val paidCents: Long,
    val scheduledCents: Long,
    val remainingCents: Long,
    val cardName: String,
    val installments: List<InvoiceInstallmentDto>,
    val payments: List<InvoicePaymentDto>,
)

@Serializable
data class PayInvoiceRequestDto(val accountId: String, val amountCents: Long, val paymentDate: String)

fun InvoiceSummaryDto.toDomain() = InvoiceSummary(
    id = id,
    cardId = creditCardId,
    referenceMonth = referenceMonth,
    closingDate = closingDate,
    dueDate = dueDate,
    status = InvoiceStatus.fromWire(status),
    overdue = overdue,
    totalCents = totalCents,
    paidCents = paidCents,
    scheduledCents = scheduledCents,
    remainingCents = remainingCents,
)

fun CreditCardDto.toDomain() = CreditCard(
    id = id,
    name = name,
    limitCents = limitCents,
    closingDay = closingDay,
    dueDay = dueDay,
    paymentAccountId = paymentAccountId,
    archived = archivedAt != null,
    usedLimitCents = usedLimitCents,
    availableLimitCents = availableLimitCents,
    openInvoice = openInvoice?.toDomain(),
)

fun PurchaseDto.toDomain() = Purchase(
    id = id,
    description = description,
    purchaseDate = purchaseDate,
    totalAmountCents = totalAmountCents,
    installmentsCount = installmentsCount,
    cancelled = cancelled,
)

fun InvoiceDetailDto.toDomain() = InvoiceDetail(
    summary = InvoiceSummary(
        id = id,
        cardId = creditCardId,
        referenceMonth = referenceMonth,
        closingDate = closingDate,
        dueDate = dueDate,
        status = InvoiceStatus.fromWire(status),
        overdue = overdue,
        totalCents = totalCents,
        paidCents = paidCents,
        scheduledCents = scheduledCents,
        remainingCents = remainingCents,
    ),
    cardName = cardName,
    installments = installments.map {
        InvoiceInstallment(
            purchaseId = it.purchaseId,
            description = it.description,
            purchaseDate = it.purchaseDate,
            installmentNumber = it.installmentNumber,
            installmentsCount = it.installmentsCount,
            amountCents = it.amountCents,
        )
    },
    payments = payments.map {
        InvoicePayment(
            id = it.id,
            accountId = it.accountId,
            amountCents = it.amountCents,
            date = it.date,
            status = TransactionStatus.fromWire(it.status),
        )
    },
)
