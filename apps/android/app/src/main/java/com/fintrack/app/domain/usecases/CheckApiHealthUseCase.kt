package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.ApiHealth
import com.fintrack.app.domain.repositories.HealthRepository

class CheckApiHealthUseCase(private val repository: HealthRepository) {
    suspend operator fun invoke(): Result<ApiHealth> = suspendRunCatching { repository.checkHealth() }
}
