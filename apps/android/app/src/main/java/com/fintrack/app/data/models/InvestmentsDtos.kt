package com.fintrack.app.data.models

import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts/investments.ts (FASE 8, ADR 0020). */
@Serializable
data class InvestmentValuationDto(
    val id: String,
    val accountId: String,
    val date: String,
    val balanceCents: Long,
    val note: String? = null,
    val yieldCents: Long? = null,
    val yieldPercent: Double? = null,
    val contributedCents: Long,
    val createdAt: String,
)

@Serializable
data class ValuationListDto(val items: List<InvestmentValuationDto>)

@Serializable
data class UpsertValuationRequestDto(
    val date: String,
    val balanceCents: Long,
    val note: String? = null,
)

@Serializable
data class InvestmentSummaryDto(
    val accountId: String,
    val accountName: String,
    val institution: String? = null,
    val product: String? = null,
    val balanceCents: Long,
    val netContributedCents: Long,
    val latestValuationDate: String? = null,
    val totalYieldCents: Long? = null,
    val totalYieldPercent: Double? = null,
)

@Serializable
data class InvestmentListDto(val items: List<InvestmentSummaryDto>)

@Serializable
data class UpdateInvestmentDetailsRequestDto(
    val institution: String? = null,
    val product: String? = null,
)

fun InvestmentValuationDto.toDomain() = InvestmentValuation(
    id = id,
    accountId = accountId,
    date = date,
    balanceCents = balanceCents,
    note = note,
    yieldCents = yieldCents,
    yieldPercent = yieldPercent,
    contributedCents = contributedCents,
    createdAt = createdAt,
)

fun InvestmentSummaryDto.toDomain() = InvestmentSummary(
    accountId = accountId,
    accountName = accountName,
    institution = institution,
    product = product,
    balanceCents = balanceCents,
    netContributedCents = netContributedCents,
    latestValuationDate = latestValuationDate,
    totalYieldCents = totalYieldCents,
    totalYieldPercent = totalYieldPercent,
)
