package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.core.network.apiCallUnit
import com.fintrack.app.data.api.InvestmentsApi
import com.fintrack.app.data.models.UpdateInvestmentDetailsRequestDto
import com.fintrack.app.data.models.UpsertValuationRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation
import com.fintrack.app.domain.repositories.InvestmentsRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class InvestmentsRepositoryImpl(
    private val api: InvestmentsApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : InvestmentsRepository {

    override suspend fun list(): List<InvestmentSummary> = withContext(ioDispatcher) {
        apiCall { api.list() }.items.map { it.toDomain() }
    }

    override suspend fun valuations(accountId: String): List<InvestmentValuation> = withContext(ioDispatcher) {
        apiCall { api.valuations(accountId) }.items.map { it.toDomain() }
    }

    override suspend fun upsertValuation(
        accountId: String,
        date: String,
        balanceCents: Long,
        note: String?,
    ): InvestmentValuation = withContext(ioDispatcher) {
        apiCall { api.upsertValuation(accountId, UpsertValuationRequestDto(date, balanceCents, note)) }
            .toDomain()
    }

    override suspend fun deleteValuation(accountId: String, id: String) = withContext(ioDispatcher) {
        apiCallUnit { api.deleteValuation(accountId, id) }
    }

    override suspend fun updateDetails(
        accountId: String,
        institution: String?,
        product: String?,
    ): InvestmentSummary = withContext(ioDispatcher) {
        apiCall { api.updateDetails(accountId, UpdateInvestmentDetailsRequestDto(institution, product)) }
            .toDomain()
    }
}
