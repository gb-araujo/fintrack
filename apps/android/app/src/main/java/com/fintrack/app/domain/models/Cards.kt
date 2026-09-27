package com.fintrack.app.domain.models

enum class InvoiceStatus(val wire: String, val label: String) {
    OPEN("open", "Aberta"),
    CLOSED("closed", "Fechada"),
    PAID("paid", "Paga");

    companion object {
        fun fromWire(value: String): InvoiceStatus = entries.firstOrNull { it.wire == value } ?: CLOSED
    }
}

/**
 * Fatura. Valores calculados pelo servidor: total = Σ parcelas das compras não canceladas,
 * pago = pagamentos efetivados, agendado = pagamentos pendentes, restante = total − pago
 * (negativo = crédito, ex.: estorno depois do pagamento).
 */
data class InvoiceSummary(
    val id: String,
    val cardId: String,
    /** Mês do VENCIMENTO (AAAA-MM): é nele que as parcelas são reconhecidas como despesa. */
    val referenceMonth: String,
    val closingDate: String,
    val dueDate: String,
    val status: InvoiceStatus,
    val overdue: Boolean,
    val totalCents: Long,
    val paidCents: Long,
    val scheduledCents: Long,
    val remainingCents: Long,
) {
    /** Quanto ainda pode ser pago/agendado (o servidor confere a mesma regra ao receber o pagamento). */
    val payableCents: Long get() = maxOf(0L, totalCents - paidCents - scheduledCents)
}

data class CreditCard(
    val id: String,
    val name: String,
    val limitCents: Long,
    val closingDay: Int,
    val dueDay: Int,
    val paymentAccountId: String?,
    val archived: Boolean,
    val usedLimitCents: Long,
    /** limite − usado; pode ficar negativo (o app avisa, não bloqueia). */
    val availableLimitCents: Long,
    val openInvoice: InvoiceSummary?,
)

data class InvoiceInstallment(
    val purchaseId: String,
    val description: String,
    val purchaseDate: String,
    val installmentNumber: Int,
    val installmentsCount: Int,
    val amountCents: Long,
)

data class InvoicePayment(
    val id: String,
    val accountId: String,
    val amountCents: Long,
    val date: String,
    val status: TransactionStatus,
)

data class InvoiceDetail(
    val summary: InvoiceSummary,
    val cardName: String,
    val installments: List<InvoiceInstallment>,
    val payments: List<InvoicePayment>,
)

data class Purchase(
    val id: String,
    val description: String,
    val purchaseDate: String,
    val totalAmountCents: Long,
    val installmentsCount: Int,
    val cancelled: Boolean,
)

data class NewCard(
    val name: String,
    val limitCents: Long,
    val closingDay: Int,
    val dueDay: Int,
    val paymentAccountId: String?,
)

data class NewPurchase(
    val description: String,
    val purchaseDate: String,
    val totalAmountCents: Long,
    val installmentsCount: Int,
    val categoryId: String?,
)
