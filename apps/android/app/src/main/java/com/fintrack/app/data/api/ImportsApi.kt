package com.fintrack.app.data.api

import com.fintrack.app.data.models.ConfirmImportRequestDto
import com.fintrack.app.data.models.ConfirmImportResponseDto
import com.fintrack.app.data.models.CreateImportRequestDto
import com.fintrack.app.data.models.ImportDetailDto
import com.fintrack.app.data.models.PayableInvoiceListDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Importação de extratos (rotas autenticadas). */
interface ImportsApi {
    @POST("api/v1/imports")
    suspend fun create(@Body body: CreateImportRequestDto): Response<ImportDetailDto>

    @GET("api/v1/imports/{id}")
    suspend fun get(@Path("id") id: String): Response<ImportDetailDto>

    @POST("api/v1/imports/{id}/confirm")
    suspend fun confirm(
        @Path("id") id: String,
        @Body body: ConfirmImportRequestDto,
    ): Response<ConfirmImportResponseDto>

    @POST("api/v1/imports/{id}/cancel")
    suspend fun cancel(@Path("id") id: String): Response<ImportDetailDto>

    @GET("api/v1/invoices/payable")
    suspend fun payableInvoices(): Response<PayableInvoiceListDto>
}
