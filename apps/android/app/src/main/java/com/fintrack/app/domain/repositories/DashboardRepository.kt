package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.DashboardSummary

interface DashboardRepository {
    /** O servidor calcula tudo (inclusive "Quanto posso gastar?"); o app só exibe. */
    suspend fun dashboard(until: String? = null): DashboardSummary
}
