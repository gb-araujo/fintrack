package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.DashboardApi
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.repositories.DashboardRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DashboardRepositoryImpl(
    private val api: DashboardApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : DashboardRepository {
    override suspend fun dashboard(until: String?): DashboardSummary = withContext(ioDispatcher) {
        apiCall { api.dashboard(until) }.toDomain()
    }
}
