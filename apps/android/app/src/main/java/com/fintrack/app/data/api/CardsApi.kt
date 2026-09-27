package com.fintrack.app.data.api

import com.fintrack.app.data.models.CreateCardRequestDto
import com.fintrack.app.data.models.CreatePurchaseRequestDto
import com.fintrack.app.data.models.CreditCardDto
import com.fintrack.app.data.models.CreditCardListDto
import com.fintrack.app.data.models.InvoiceDetailDto
import com.fintrack.app.data.models.InvoiceListDto
import com.fintrack.app.data.models.PayInvoiceRequestDto
import com.fintrack.app.data.models.PurchaseDto
import com.fintrack.app.data.models.PurchaseListDto
import com.fintrack.app.data.models.TransactionDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

/** Cartões, compras e faturas (rotas autenticadas). */
interface CardsApi {
    @GET("api/v1/credit-cards")
    suspend fun cards(): Response<CreditCardListDto>

    @GET("api/v1/credit-cards/{id}")
    suspend fun card(@Path("id") id: String): Response<CreditCardDto>

    @POST("api/v1/credit-cards")
    suspend fun createCard(@Body body: CreateCardRequestDto): Response<CreditCardDto>

    @GET("api/v1/credit-cards/{id}/invoices")
    suspend fun invoices(@Path("id") cardId: String): Response<InvoiceListDto>

    @GET("api/v1/invoices/{id}")
    suspend fun invoice(@Path("id") id: String): Response<InvoiceDetailDto>

    @POST("api/v1/invoices/{id}/payments")
    suspend fun payInvoice(@Path("id") id: String, @Body body: PayInvoiceRequestDto): Response<TransactionDto>

    @GET("api/v1/credit-cards/{id}/purchases")
    suspend fun purchases(@Path("id") cardId: String): Response<PurchaseListDto>

    @POST("api/v1/credit-cards/{id}/purchases")
    suspend fun createPurchase(
        @Path("id") cardId: String,
        @Body body: CreatePurchaseRequestDto,
    ): Response<PurchaseDto>

    @POST("api/v1/purchases/{id}/cancel")
    suspend fun cancelPurchase(@Path("id") id: String): Response<PurchaseDto>
}
