package com.fintrack.app.data.api

import com.fintrack.app.data.models.AuthResponseDto
import com.fintrack.app.data.models.LoginRequestDto
import com.fintrack.app.data.models.RefreshRequestDto
import com.fintrack.app.data.models.RegisterRequestDto
import com.fintrack.app.data.models.UserDto
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Rotas públicas de autenticação (cliente HTTP sem Bearer e sem renovação automática). */
interface AuthApi {
    @POST("api/v1/auth/register")
    suspend fun register(@Body body: RegisterRequestDto): Response<AuthResponseDto>

    @POST("api/v1/auth/login")
    suspend fun login(@Body body: LoginRequestDto): Response<AuthResponseDto>

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body body: RefreshRequestDto): Response<AuthResponseDto>

    @POST("api/v1/auth/logout")
    suspend fun logout(@Body body: RefreshRequestDto): Response<Unit>
}

/** Rotas autenticadas (cliente HTTP com Bearer + TokenAuthenticator). */
interface UsersApi {
    @GET("api/v1/users/me")
    suspend fun me(): Response<UserDto>
}
