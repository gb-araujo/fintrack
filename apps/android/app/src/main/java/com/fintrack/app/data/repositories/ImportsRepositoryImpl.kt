package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.ImportsApi
import com.fintrack.app.data.models.ConfirmImportRequestDto
import com.fintrack.app.data.models.CreateImportRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.data.models.toDto
import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.PayableInvoice
import com.fintrack.app.domain.repositories.ImportsRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ImportsRepositoryImpl(
    private val api: ImportsApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : ImportsRepository {

    override suspend fun create(accountId: String, filename: String, content: String): ImportReview =
        withContext(ioDispatcher) {
            apiCall { api.create(CreateImportRequestDto(accountId, filename, content)) }.toDomain()
        }

    override suspend fun confirm(importId: String, choices: Map<String, ImportChoice>): ImportResult =
        withContext(ioDispatcher) {
            val decisions = choices.map { (rowId, choice) -> choice.toDto(rowId) }
            apiCall { api.confirm(importId, ConfirmImportRequestDto(decisions)) }.toDomain()
        }

    override suspend fun cancel(importId: String) {
        withContext(ioDispatcher) { apiCall { api.cancel(importId) } }
    }

    override suspend fun payableInvoices(): List<PayableInvoice> = withContext(ioDispatcher) {
        apiCall { api.payableInvoices() }.items.map { it.toDomain() }
    }
}
