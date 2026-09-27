package com.fintrack.app.core.network

import com.fintrack.app.data.session.SessionManager
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import okhttp3.Dispatcher
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
     * Cliente base (rotas públicas: health e auth). Sempre envia `X-Client: android`.
     * O log (apenas debug) registra somente método, URL e status — nunca corpo ou tokens.
     */
    fun okHttpClient(enableLogging: Boolean): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .addInterceptor(ClientHeaderInterceptor())
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

    /**
     * Cliente das rotas autenticadas: Bearer em toda requisição e renovação automática em 401.
     * Deriva do cliente base (mesmo pool de conexões), mas com Dispatcher PRÓPRIO: o
     * TokenAuthenticator bloqueia a thread da requisição enquanto o refresh (feito pelo cliente
     * base) acontece. Com um dispatcher compartilhado, 5 requisições simultâneas recebendo 401
     * ocupariam todas as vagas por host e o refresh nunca executaria (deadlock).
     */
    fun authenticatedClient(base: OkHttpClient, sessionManager: SessionManager): OkHttpClient =
        base.newBuilder()
            .dispatcher(Dispatcher())
            .addInterceptor(AuthInterceptor(sessionManager))
            .authenticator(TokenAuthenticator(sessionManager))
            .build()

    fun retrofit(baseUrl: String, client: OkHttpClient): Retrofit =
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
}
