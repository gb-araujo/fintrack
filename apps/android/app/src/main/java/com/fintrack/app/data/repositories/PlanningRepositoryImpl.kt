package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.PlanningApi
import com.fintrack.app.data.models.ConfirmOccurrenceRequestDto
import com.fintrack.app.data.models.UpsertBudgetRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.repositories.PlanningRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class PlanningRepositoryImpl(
    private val api: PlanningApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : PlanningRepository {

    override suspend fun budgets(month: String): BudgetSummary = withContext(ioDispatcher) {
        apiCall { api.budgets(month) }.toDomain()
    }

    override suspend fun saveBudget(categoryId: String, month: String, limitCents: Long): Budget =
        withContext(ioDispatcher) {
            apiCall { api.saveBudget(UpsertBudgetRequestDto(categoryId, month, limitCents)) }.toDomain()
        }

    override suspend fun occurrences(): List<Occurrence> = withContext(ioDispatcher) {
        apiCall { api.occurrences() }.items.map { it.toDomain() }
    }

    override suspend fun confirmOccurrence(
        recurringId: String,
        date: String,
        amountCents: Long,
        transactionDate: String,
    ) {
        withContext(ioDispatcher) {
            apiCall {
                api.confirmOccurrence(recurringId, date, ConfirmOccurrenceRequestDto(amountCents, transactionDate))
            }
        }
    }

    override suspend fun skipOccurrence(recurringId: String, date: String) {
        withContext(ioDispatcher) { apiCall { api.skipOccurrence(recurringId, date) } }
    }
}
