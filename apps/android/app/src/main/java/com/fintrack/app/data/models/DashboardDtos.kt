package com.fintrack.app.data.models

import com.fintrack.app.domain.models.AvailableComponents
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.models.PendingBill
import kotlinx.serialization.Serializable

/** Espelho de `dashboardSchema` (packages/shared/src/contracts/dashboard.ts). */
@Serializable
data class DashboardDto(
    val today: String,
    val until: String,
    val availableToSpend: AvailableDto,
    val totalBalanceCents: Long,
    val investmentsCents: Long,
    val month: MonthDto,
    val pendingBills: PendingBillsDto,
    val futureCommitments: FutureDto,
)

@Serializable
data class AvailableDto(val amountCents: Long, val components: ComponentsDto)

@Serializable
data class ComponentsDto(
    val liquidBalanceCents: Long,
    val pendingIncomeCents: Long,
    val pendingExpensesCents: Long,
    val pendingTransfersInCents: Long,
    val pendingTransfersOutCents: Long,
)

@Serializable
data class MonthDto(val incomeCents: Long, val expenseCents: Long)

@Serializable
data class PendingBillDto(
    val id: String,
    val description: String,
    val amountCents: Long,
    val date: String,
    val overdue: Boolean,
)

@Serializable
data class PendingBillsDto(
    val count: Int,
    val totalCents: Long,
    val overdueCount: Int,
    val next: List<PendingBillDto>,
)

@Serializable
data class FutureDto(val count: Int, val totalCents: Long)

fun DashboardDto.toDomain() = DashboardSummary(
    today = today,
    until = until,
    availableCents = availableToSpend.amountCents,
    components = availableToSpend.components.let {
        AvailableComponents(
            it.liquidBalanceCents,
            it.pendingIncomeCents,
            it.pendingExpensesCents,
            it.pendingTransfersInCents,
            it.pendingTransfersOutCents,
        )
    },
    totalBalanceCents = totalBalanceCents,
    investmentsCents = investmentsCents,
    monthIncomeCents = month.incomeCents,
    monthExpenseCents = month.expenseCents,
    pendingCount = pendingBills.count,
    pendingTotalCents = pendingBills.totalCents,
    overdueCount = pendingBills.overdueCount,
    nextBills = pendingBills.next.map { PendingBill(it.id, it.description, it.amountCents, it.date, it.overdue) },
    futureCount = futureCommitments.count,
    futureTotalCents = futureCommitments.totalCents,
)
