package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.DashboardSummary

interface DashboardRepository {
    /** O servidor calcula tudo (inclusive o dinheiro disponível); o app só exibe. */
    suspend fun dashboard(until: String? = null): DashboardSummary
}
