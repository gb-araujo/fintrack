package com.fintrack.app.testing

import com.fintrack.app.data.local.TokenStorage
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.models.User
import com.fintrack.app.domain.repositories.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

class InMemoryTokenStorage(var token: String? = null) : TokenStorage {
    override suspend fun readRefreshToken(): String? = token

    override suspend fun saveRefreshToken(token: String) {
        this.token = token
    }

    override suspend fun clear() {
        token = null
    }
}

val testUser = User(
    id = "4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77",
    name = "Gabriel Araujo",
    email = "gabriel@exemplo.com",
    timezone = "America/Sao_Paulo",
    currency = "BRL",
)

class FakeAuthRepository(
    initial: SessionState = SessionState.Unauthenticated,
) : AuthRepository {
    private val state = MutableStateFlow(initial)
    override val sessionState: StateFlow<SessionState> = state

    var loginResult: () -> User = { testUser }
    var registerResult: () -> User = { testUser }
    val loginCalls = mutableListOf<Pair<String, String>>()
    val registerCalls = mutableListOf<List<String?>>()
    var logoutCalls = 0

    override suspend fun login(email: String, password: String): User {
        loginCalls += email to password
        return loginResult().also { state.value = SessionState.Authenticated(it) }
    }

    override suspend fun register(name: String, email: String, password: String, timezone: String?): User {
        registerCalls += listOf(name, email, password, timezone)
        return registerResult().also { state.value = SessionState.Authenticated(it) }
    }

    override suspend fun logout() {
        logoutCalls++
        state.value = SessionState.Unauthenticated
    }

    override suspend fun restoreSession() = Unit
}
