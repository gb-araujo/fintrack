package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.ApiHealth

interface HealthRepository {
    suspend fun checkHealth(): ApiHealth
}
