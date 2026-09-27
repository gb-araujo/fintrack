package com.fintrack.app.domain.models

/** Componentes do cálculo de "Quanto posso gastar?" — calculados pelo backend. */
data class AvailableComponents(
    val liquidBalanceCents: Long,
    val pendingIncomeCents: Long,
    val pendingExpensesCents: Long,
    val pendingTransfersInCents: Long,
    val pendingTransfersOutCents: Long,
)

data class PendingBill(
    val id: String,
    val description: String,
    val amountCents: Long,
    val date: String,
    val overdue: Boolean,
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
    val pendingCount: Int,
    val pendingTotalCents: Long,
    val overdueCount: Int,
    val nextBills: List<PendingBill>,
    val futureCount: Int,
    val futureTotalCents: Long,
)
