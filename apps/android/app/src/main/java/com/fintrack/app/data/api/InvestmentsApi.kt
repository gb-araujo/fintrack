package com.fintrack.app.data.api

import com.fintrack.app.data.models.InvestmentListDto
import com.fintrack.app.data.models.InvestmentSummaryDto
import com.fintrack.app.data.models.InvestmentValuationDto
import com.fintrack.app.data.models.UpdateInvestmentDetailsRequestDto
import com.fintrack.app.data.models.UpsertValuationRequestDto
import com.fintrack.app.data.models.ValuationListDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.PUT
import retrofit2.http.Path

/** Rendimento de investimento (FASE 8, ADR 0020): derivado das avaliações, nunca guardado. */
interface InvestmentsApi {
    @GET("api/v1/investments")
    suspend fun list(): Response<InvestmentListDto>

    @PATCH("api/v1/investments/{accountId}")
    suspend fun updateDetails(
        @Path("accountId") accountId: String,
        @Body body: UpdateInvestmentDetailsRequestDto,
    ): Response<InvestmentSummaryDto>

    @GET("api/v1/investments/{accountId}/valuations")
    suspend fun valuations(@Path("accountId") accountId: String): Response<ValuationListDto>

    @PUT("api/v1/investments/{accountId}/valuations")
    suspend fun upsertValuation(
        @Path("accountId") accountId: String,
        @Body body: UpsertValuationRequestDto,
    ): Response<InvestmentValuationDto>

    @DELETE("api/v1/investments/{accountId}/valuations/{id}")
    suspend fun deleteValuation(
        @Path("accountId") accountId: String,
        @Path("id") id: String,
    ): Response<Unit>
}
