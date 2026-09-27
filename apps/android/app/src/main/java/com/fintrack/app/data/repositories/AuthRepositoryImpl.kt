package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.AuthApi
import com.fintrack.app.data.models.LoginRequestDto
import com.fintrack.app.data.models.RefreshRequestDto
import com.fintrack.app.data.models.RegisterRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.data.session.SessionManager
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.models.User
import com.fintrack.app.domain.repositories.AuthRepository
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.StateFlow

class AuthRepositoryImpl(
    private val authApi: AuthApi,
    private val sessionManager: SessionManager,
) : AuthRepository {

    override val sessionState: StateFlow<SessionState> = sessionManager.state

    override suspend fun login(email: String, password: String): User {
        val response = apiCall { authApi.login(LoginRequestDto(email, password)) }
        sessionManager.start(response)
        return response.user.toDomain()
    }

    override suspend fun register(
        name: String,
        email: String,
        password: String,
        timezone: String?,
    ): User {
        val response = apiCall { authApi.register(RegisterRequestDto(name, email, password, timezone)) }
        sessionManager.start(response)
        return response.user.toDomain()
    }

    override suspend fun logout() {
        val refreshToken = sessionManager.end() ?: return
        try {
            authApi.logout(RefreshRequestDto(refreshToken))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Melhor esforço: a sessão local já foi encerrada; o token expira sozinho na API.
        }
    }

    override suspend fun restoreSession() = sessionManager.restore()
}
