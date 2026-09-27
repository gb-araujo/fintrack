package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.core.network.toApiException
import com.fintrack.app.data.api.HealthApi
import com.fintrack.app.data.models.HealthResponseDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.ApiHealth
import com.fintrack.app.domain.repositories.HealthRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerializationException

class HealthRepositoryImpl(
    private val api: HealthApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : HealthRepository {

    override suspend fun checkHealth(): ApiHealth = withContext(ioDispatcher) {
        val response = api.getHealth()
        val body = response.body()
        if (response.isSuccessful && body != null) return@withContext body.toDomain()

        // 503 traz o mesmo corpo do /health indicando qual dependência falhou.
        if (response.code() == 503) {
            val raw = response.errorBody()?.string().orEmpty()
            val degraded = try {
                NetworkModule.json.decodeFromString<HealthResponseDto>(raw)
            } catch (_: SerializationException) {
                null
            } catch (_: IllegalArgumentException) {
                null
            }
            if (degraded != null) return@withContext degraded.toDomain()
        }

        throw response.toApiException()
    }
}
