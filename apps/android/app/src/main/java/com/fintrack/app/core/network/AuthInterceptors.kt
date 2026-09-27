package com.fintrack.app.core.network

import com.fintrack.app.data.session.SessionManager
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/** Identifica o app: a API entrega o refresh token no corpo (não em cookie). */
class ClientHeaderInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request().newBuilder().header(CLIENT_HEADER, CLIENT_ANDROID).build())

    companion object {
        const val CLIENT_HEADER = "X-Client"
        const val CLIENT_ANDROID = "android"
    }
}

/** Anexa o access token (em memória) às requisições do cliente autenticado. */
class AuthInterceptor(private val sessionManager: SessionManager) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = sessionManager.currentAccessToken()
        val request = chain.request()
        if (token == null || request.header(AUTHORIZATION) != null) return chain.proceed(request)
        return chain.proceed(request.newBuilder().header(AUTHORIZATION, "Bearer $token").build())
    }
}

/**
 * Em 401, renova a sessão (uma vez) e repete a requisição com o novo token.
 * Se a renovação falhar, devolve null: o 401 chega ao chamador e a sessão já foi encerrada.
 */
class TokenAuthenticator(private val sessionManager: SessionManager) : Authenticator {
    override fun authenticate(route: Route?, response: Response): Request? {
        val failed = response.request.header(AUTHORIZATION)?.removePrefix("Bearer ") ?: return null
        if (priorResponses(response) >= 1) return null // já tentou uma vez: evita loop

        // OkHttp chama o Authenticator numa thread de rede (não na main); bloquear aqui é esperado.
        val renewed = runBlocking { sessionManager.refreshAfterUnauthorized(failed) } ?: return null
        return response.request.newBuilder().header(AUTHORIZATION, "Bearer $renewed").build()
    }

    private fun priorResponses(response: Response): Int {
        var count = 0
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}

private const val AUTHORIZATION = "Authorization"
