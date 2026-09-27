package com.fintrack.app.data.models

import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetStatus
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.models.TransactionType
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts (budgets, recurring). */
@Serializable
data class BudgetDto(
    val id: String,
    val categoryId: String,
    val categoryName: String,
    val limitCents: Long,
    val spentCents: Long,
    val pendingCents: Long,
    val remainingCents: Long,
    val percentUsed: Int,
    val status: String,
)

@Serializable
data class BudgetTotalsDto(val limitCents: Long, val spentCents: Long, val remainingCents: Long)

@Serializable
data class BudgetListDto(
    val month: String,
    val items: List<BudgetDto>,
    val totals: BudgetTotalsDto,
    val unbudgetedSpentCents: Long,
)

@Serializable
data class UpsertBudgetRequestDto(val categoryId: String, val month: String, val limitCents: Long)

@Serializable
data class OccurrenceDto(
    val recurringId: String,
    val name: String,
    val type: String,
    val date: String,
    val amountCents: Long,
    val estimated: Boolean,
    val accountId: String,
    val overdue: Boolean,
)

@Serializable
data class OccurrenceListDto(val from: String, val until: String, val items: List<OccurrenceDto>)

@Serializable
data class ConfirmOccurrenceRequestDto(val amountCents: Long, val transactionDate: String)

fun BudgetDto.toDomain() = Budget(
    id = id,
    categoryId = categoryId,
    categoryName = categoryName,
    limitCents = limitCents,
    spentCents = spentCents,
    pendingCents = pendingCents,
    remainingCents = remainingCents,
    percentUsed = percentUsed,
    status = BudgetStatus.fromWire(status),
)

fun BudgetListDto.toDomain() = BudgetSummary(
    month = month,
    items = items.map { it.toDomain() },
    limitCents = totals.limitCents,
    spentCents = totals.spentCents,
    remainingCents = totals.remainingCents,
    unbudgetedSpentCents = unbudgetedSpentCents,
)

fun OccurrenceDto.toDomain() = Occurrence(
    recurringId = recurringId,
    name = name,
    type = TransactionType.fromWire(type),
    date = date,
    amountCents = amountCents,
    estimated = estimated,
    accountId = accountId,
    overdue = overdue,
)
