package com.fintrack.app.data.api

import com.fintrack.app.data.models.HealthResponseDto
import retrofit2.Response
import retrofit2.http.GET

interface HealthApi {
    /** /health fica na raiz (fora de /api/v1) porque também é o healthcheck do Railway. */
    @GET("health")
    suspend fun getHealth(): Response<HealthResponseDto>
}
