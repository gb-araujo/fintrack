package com.fintrack.app.data.api

import com.fintrack.app.data.models.AccountDto
import com.fintrack.app.data.models.AccountListDto
import com.fintrack.app.data.models.CategoryListDto
import com.fintrack.app.data.models.CompleteRequestDto
import com.fintrack.app.data.models.CreateAccountRequestDto
import com.fintrack.app.data.models.CreateTransactionRequestDto
import com.fintrack.app.data.models.CreateTransferRequestDto
import com.fintrack.app.data.models.TransactionDto
import com.fintrack.app.data.models.TransactionListDto
import com.fintrack.app.data.models.TransferDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/** Rotas autenticadas do livro-caixa (cliente com Bearer + renovação automática). */
interface LedgerApi {
    @GET("api/v1/accounts")
    suspend fun accounts(@Query("includeArchived") includeArchived: Boolean): Response<AccountListDto>

    @POST("api/v1/accounts")
    suspend fun createAccount(@Body body: CreateAccountRequestDto): Response<AccountDto>

    @GET("api/v1/categories")
    suspend fun categories(): Response<CategoryListDto>

    @GET("api/v1/transactions")
    suspend fun transactions(
        @Query("limit") limit: Int,
        @Query("cursor") cursor: String?,
        @Query("accountId") accountId: String?,
        @Query("type") type: String?,
        @Query("status") status: String?,
    ): Response<TransactionListDto>

    @POST("api/v1/transactions")
    suspend fun createTransaction(@Body body: CreateTransactionRequestDto): Response<TransactionDto>

    @POST("api/v1/transactions/{id}/complete")
    suspend fun completeTransaction(
        @Path("id") id: String,
        @Body body: CompleteRequestDto,
    ): Response<TransactionDto>

    @POST("api/v1/transactions/{id}/cancel")
    suspend fun cancelTransaction(@Path("id") id: String): Response<TransactionDto>

    @POST("api/v1/transfers")
    suspend fun createTransfer(@Body body: CreateTransferRequestDto): Response<TransferDto>

    @POST("api/v1/transfers/{id}/complete")
    suspend fun completeTransfer(
        @Path("id") id: String,
        @Body body: CompleteRequestDto,
    ): Response<TransferDto>

    @POST("api/v1/transfers/{id}/cancel")
    suspend fun cancelTransfer(@Path("id") id: String): Response<TransferDto>
}
