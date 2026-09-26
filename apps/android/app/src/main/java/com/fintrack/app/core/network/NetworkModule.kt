package com.fintrack.app.core.network

import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory

object NetworkModule {
    /** Tolerante a campos novos da API: o app antigo continua funcionando após deploys do backend. */
    val json: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    /**
     * A partir da FASE 1 recebe o AuthInterceptor (Bearer) e o TokenAuthenticator (refresh em 401).
     * O log (apenas debug) registra somente método, URL e status — nunca corpo ou tokens.
     */
    fun okHttpClient(enableLogging: Boolean): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .apply {
                if (enableLogging) {
                    addInterceptor(
                        HttpLoggingInterceptor().apply {
                            level = HttpLoggingInterceptor.Level.BASIC
                            redactHeader("Authorization")
                            redactHeader("Cookie")
                        },
                    )
                }
            }
            .build()

    fun retrofit(baseUrl: String, client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
