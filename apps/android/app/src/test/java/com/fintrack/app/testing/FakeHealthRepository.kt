package com.fintrack.app.testing

import com.fintrack.app.domain.models.ApiHealth
import com.fintrack.app.domain.repositories.HealthRepository

class FakeHealthRepository(
    var result: () -> ApiHealth = { healthy() },
) : HealthRepository {
    var calls = 0
        private set

    override suspend fun checkHealth(): ApiHealth {
        calls++
        return result()
    }

    companion object {
        fun healthy(version: String = "1.0.0") =
            ApiHealth(isHealthy = true, version = version, databaseAvailable = true, uptimeSeconds = 10)

        fun databaseDown(version: String = "1.0.0") =
            ApiHealth(isHealthy = false, version = version, databaseAvailable = false, uptimeSeconds = 10)
    }
}
