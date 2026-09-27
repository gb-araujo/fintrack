package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.models.User
import kotlinx.coroutines.flow.StateFlow

interface AuthRepository {
    val sessionState: StateFlow<SessionState>

    suspend fun login(email: String, password: String): User

    suspend fun register(name: String, email: String, password: String, timezone: String?): User

    /** Encerra a sessão na API (melhor esforço) e SEMPRE limpa a sessão local. */
    suspend fun logout()

    /** Restaura a sessão salva ao abrir o app. */
    suspend fun restoreSession()
}
