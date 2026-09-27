package com.fintrack.app.data.models

import com.fintrack.app.domain.models.ApiHealth
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Espelho de `healthResponseSchema` (packages/shared/src/contracts/health.ts). */
@Serializable
data class HealthResponseDto(
    val status: String,
    val version: String,
    val uptimeSeconds: Long,
    val timestamp: String,
    val checks: HealthChecksDto,
)

@Serializable
data class HealthChecksDto(
    val database: String,
)

/** Envelope padrão de erro da API: `{ "error": { "code", "message", "details"? } }`. */
@Serializable
data class ApiErrorEnvelopeDto(val error: ApiErrorDto)

@Serializable
data class ApiErrorDto(val code: String, val message: String, val details: JsonElement? = null)

fun HealthResponseDto.toDomain(): ApiHealth =
    ApiHealth(
        isHealthy = status == "ok",
        version = version,
        databaseAvailable = checks.database == "ok",
        uptimeSeconds = uptimeSeconds,
    )
