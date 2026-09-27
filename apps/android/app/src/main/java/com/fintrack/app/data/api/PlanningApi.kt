package com.fintrack.app.data.api

import com.fintrack.app.data.models.BudgetDto
import com.fintrack.app.data.models.BudgetListDto
import com.fintrack.app.data.models.ConfirmOccurrenceRequestDto
import com.fintrack.app.data.models.OccurrenceListDto
import com.fintrack.app.data.models.TransactionDto
import com.fintrack.app.data.models.UpsertBudgetRequestDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/** Orçamentos e recorrências (rotas autenticadas). */
interface PlanningApi {
    @GET("api/v1/budgets")
    suspend fun budgets(@Query("month") month: String): Response<BudgetListDto>

    @PUT("api/v1/budgets")
    suspend fun saveBudget(@Body body: UpsertBudgetRequestDto): Response<BudgetDto>

    @GET("api/v1/recurring/occurrences")
    suspend fun occurrences(): Response<OccurrenceListDto>

    @POST("api/v1/recurring/{id}/occurrences/{date}/confirm")
    suspend fun confirmOccurrence(
        @Path("id") id: String,
        @Path("date") date: String,
        @Body body: ConfirmOccurrenceRequestDto,
    ): Response<TransactionDto>

    @POST("api/v1/recurring/{id}/occurrences/{date}/skip")
    suspend fun skipOccurrence(@Path("id") id: String, @Path("date") date: String): Response<TransactionDto>
}
