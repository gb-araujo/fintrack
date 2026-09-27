package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation

/** Rendimento de investimento (FASE 8, ADR 0020): sempre derivado no servidor a partir do histórico. */
interface InvestmentsRepository {
    suspend fun list(): List<InvestmentSummary>

    suspend fun valuations(accountId: String): List<InvestmentValuation>

    /** Cria a avaliação da data, ou corrige se já existir uma na mesma data (nunca duplica). */
    suspend fun upsertValuation(
        accountId: String,
        date: String,
        balanceCents: Long,
        note: String?,
    ): InvestmentValuation

    suspend fun deleteValuation(accountId: String, id: String)

    suspend fun updateDetails(
        accountId: String,
        institution: String?,
        product: String?,
    ): InvestmentSummary
}
