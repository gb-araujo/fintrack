package com.fintrack.app.domain.models

/**
 * Rendimento de investimento (FASE 8, ADR 0020): nunca é um número guardado — é sempre derivado
 * das avaliações (histórico nunca sobrescrito). `null` = ainda não há avaliação suficiente.
 */
data class InvestmentSummary(
    val accountId: String,
    val accountName: String,
    val institution: String?,
    val product: String?,
    val balanceCents: Long,
    /** Aplicado − resgatado desde a criação da conta (não é rendimento). */
    val netContributedCents: Long,
    val latestValuationDate: String?,
    val totalYieldCents: Long?,
    val totalYieldPercent: Double?,
)

/** Uma avaliação: "a posição valia X nesta data" — nunca sobrescrita, só corrigida na mesma data. */
data class InvestmentValuation(
    val id: String,
    val accountId: String,
    val date: String,
    val balanceCents: Long,
    val note: String?,
    /** Rendimento desde a avaliação anterior; null na primeira avaliação. */
    val yieldCents: Long?,
    val yieldPercent: Double?,
    val contributedCents: Long,
    val createdAt: String,
)
