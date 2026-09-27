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
    val cardLiabilitiesCents: Long = 0,
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
    /** Previsões de recorrências ainda não confirmadas (FASE 4). */
    val forecastIncomeCents: Long = 0,
    val forecastExpensesCents: Long = 0,
    /** Faturas de cartão a pagar até o horizonte (FASE 5). */
    val invoicesCents: Long = 0,
)

@Serializable
data class MonthDto(val incomeCents: Long, val expenseCents: Long, val cardExpenseCents: Long = 0)

@Serializable
data class PendingBillDto(
    val id: String,
    /** "transaction" (lançamento pendente) ou "recurring" (ocorrência prevista de uma recorrência). */
    val kind: String = "transaction",
    val description: String,
    val amountCents: Long,
    val estimated: Boolean = false,
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
            it.forecastIncomeCents,
            it.forecastExpensesCents,
            it.invoicesCents,
        )
    },
    totalBalanceCents = totalBalanceCents,
    investmentsCents = investmentsCents,
    monthIncomeCents = month.incomeCents,
    monthExpenseCents = month.expenseCents,
    monthCardExpenseCents = month.cardExpenseCents,
    cardLiabilitiesCents = cardLiabilitiesCents,
    pendingCount = pendingBills.count,
    pendingTotalCents = pendingBills.totalCents,
    overdueCount = pendingBills.overdueCount,
    nextBills = pendingBills.next.map {
        PendingBill(
            id = it.id,
            description = it.description,
            amountCents = it.amountCents,
            date = it.date,
            overdue = it.overdue,
            recurring = it.kind == "recurring",
            invoice = it.kind == "invoice",
            estimated = it.estimated,
        )
    },
    futureCount = futureCommitments.count,
    futureTotalCents = futureCommitments.totalCents,
)
