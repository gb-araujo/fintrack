package com.fintrack.app.data.session

import com.fintrack.app.core.network.ApiException
import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.AuthApi
import com.fintrack.app.data.local.TokenStorage
import com.fintrack.app.data.models.AuthResponseDto
import com.fintrack.app.data.models.RefreshRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.SessionState
import java.io.IOException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Dono da sessão no app:
 * - access token só em memória;
 * - refresh token cifrado no [TokenStorage];
 * - renovação serializada por [Mutex]: várias requisições recebendo 401 ao mesmo tempo geram
 *   UMA única chamada de refresh (o token é rotacionado a cada uso — ADR 0007).
 */
class SessionManager(
    private val authApi: AuthApi,
    private val tokenStorage: TokenStorage,
) {
    private val mutex = Mutex()

    @Volatile
    private var accessToken: String? = null

    private val _state = MutableStateFlow<SessionState>(SessionState.Restoring)
    val state: StateFlow<SessionState> = _state.asStateFlow()

    fun currentAccessToken(): String? = accessToken

    suspend fun start(response: AuthResponseDto) = mutex.withLock { apply(response) }

    /** Restaura a sessão salva (abertura do app). */
    suspend fun restore() {
        mutex.withLock {
            val refreshToken = tokenStorage.readRefreshToken()
            if (refreshToken == null) {
                _state.value = SessionState.Unauthenticated
                return
            }
            _state.value = SessionState.Restoring
            try {
                apply(apiCall { authApi.refresh(RefreshRequestDto(refreshToken)) })
            } catch (e: ApiException) {
                if (e.statusCode == 401) clearLocked() else unreachable()
            } catch (_: IOException) {
                unreachable() // sem rede: mantém o token salvo para tentar de novo
            }
        }
    }

    /**
     * Chamado pelo TokenAuthenticator após um 401. Se outra requisição já renovou a sessão
     * enquanto esta esperava o mutex, apenas devolve o token novo.
     * Retorna null quando não há como renovar (sessão encerrada ou sem rede).
     */
    suspend fun refreshAfterUnauthorized(failedAccessToken: String?): String? = mutex.withLock {
        val current = accessToken
        if (current != null && current != failedAccessToken) return@withLock current

        val refreshToken = tokenStorage.readRefreshToken() ?: run {
            clearLocked()
            return@withLock null
        }
        try {
            apply(apiCall { authApi.refresh(RefreshRequestDto(refreshToken)) })
            accessToken
        } catch (e: ApiException) {
            if (e.statusCode == 401) clearLocked()
            null
        } catch (_: IOException) {
            null
        }
    }

    /** Encerra a sessão local e devolve o refresh token (para revogá-lo na API). */
    suspend fun end(): String? = mutex.withLock {
        val refreshToken = tokenStorage.readRefreshToken()
        clearLocked()
        refreshToken
    }

    private suspend fun apply(response: AuthResponseDto) {
        val refreshToken = requireNotNull(response.refreshToken) {
            "A API não devolveu refresh token (header X-Client: android ausente?)"
        }
        tokenStorage.saveRefreshToken(refreshToken)
        accessToken = response.accessToken
        _state.value = SessionState.Authenticated(response.user.toDomain())
    }

    private suspend fun clearLocked() {
        accessToken = null
        tokenStorage.clear()
        _state.value = SessionState.Unauthenticated
    }

    private fun unreachable() {
        _state.value = SessionState.Unreachable("Não foi possível conectar ao servidor.")
    }
}
