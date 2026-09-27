package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.repositories.DashboardRepository

class GetDashboardUseCase(private val repository: DashboardRepository) {
    suspend operator fun invoke(until: String? = null): Result<DashboardSummary> =
        suspendRunCatching { repository.dashboard(until) }
}
