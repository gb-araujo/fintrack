package com.fintrack.app.data.api

import com.fintrack.app.data.models.DashboardDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface DashboardApi {
    @GET("api/v1/dashboard")
    suspend fun dashboard(@Query("until") until: String?): Response<DashboardDto>
}
