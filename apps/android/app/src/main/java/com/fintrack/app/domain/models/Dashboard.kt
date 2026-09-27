package com.fintrack.app.domain.models

/** Componentes do cálculo de "Quanto posso gastar?" — calculados pelo backend. */
data class AvailableComponents(
    val liquidBalanceCents: Long,
    val pendingIncomeCents: Long,
    val pendingExpensesCents: Long,
    val pendingTransfersInCents: Long,
    val pendingTransfersOutCents: Long,
    val forecastIncomeCents: Long = 0,
    val forecastExpensesCents: Long = 0,
    val invoicesCents: Long = 0,
)

data class PendingBill(
    val id: String,
    val description: String,
    val amountCents: Long,
    val date: String,
    val overdue: Boolean,
    /** Ocorrência prevista de uma recorrência (ainda não é lançamento). */
    val recurring: Boolean = false,
    /** Fatura de cartão a vencer (kind = "invoice"). */
    val invoice: Boolean = false,
    /** Valor estimado (recorrência de valor variável). */
    val estimated: Boolean = false,
)

data class DashboardSummary(
    val today: String,
    val until: String,
    val availableCents: Long,
    val components: AvailableComponents,
    val totalBalanceCents: Long,
    val investmentsCents: Long,
    val monthIncomeCents: Long,
    val monthExpenseCents: Long,
    /** Parte de `monthExpenseCents` vinda de parcelas de cartão (informativo). */
    val monthCardExpenseCents: Long = 0,
    /** Tudo que ainda se deve nos cartões (todas as faturas, inclusive parcelas futuras). */
    val cardLiabilitiesCents: Long = 0,
    val pendingCount: Int,
    val pendingTotalCents: Long,
    val overdueCount: Int,
    val nextBills: List<PendingBill>,
    val futureCount: Int,
    val futureTotalCents: Long,
)
