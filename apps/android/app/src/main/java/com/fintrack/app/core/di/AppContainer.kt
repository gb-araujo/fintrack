package com.fintrack.app.core.di

import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.AuthApi
import com.fintrack.app.data.api.HealthApi
import com.fintrack.app.data.api.UsersApi
import com.fintrack.app.data.local.TokenStorage
import com.fintrack.app.data.repositories.AuthRepositoryImpl
import com.fintrack.app.data.repositories.HealthRepositoryImpl
import com.fintrack.app.data.session.SessionManager
import com.fintrack.app.domain.repositories.AuthRepository
import com.fintrack.app.domain.repositories.HealthRepository
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
import com.fintrack.app.domain.usecases.LoginUseCase
import com.fintrack.app.domain.usecases.LogoutUseCase
import com.fintrack.app.domain.usecases.ObserveSessionUseCase
import com.fintrack.app.domain.usecases.RegisterUseCase
import com.fintrack.app.domain.usecases.RestoreSessionUseCase

/**
 * Injeção de dependências manual. Simples o bastante para o início do projeto;
 * pode ser migrado para Hilt quando o número de dependências crescer.
 */
class AppContainer(
    baseUrl: String,
    enableHttpLogging: Boolean,
    tokenStorage: TokenStorage,
) {
    private val baseClient by lazy { NetworkModule.okHttpClient(enableHttpLogging) }
    private val publicRetrofit by lazy { NetworkModule.retrofit(baseUrl, baseClient) }

    val sessionManager: SessionManager by lazy {
        SessionManager(publicRetrofit.create(AuthApi::class.java), tokenStorage)
    }

    private val authenticatedRetrofit by lazy {
        NetworkModule.retrofit(baseUrl, NetworkModule.authenticatedClient(baseClient, sessionManager))
    }

    val usersApi: UsersApi by lazy { authenticatedRetrofit.create(UsersApi::class.java) }

    val healthRepository: HealthRepository by lazy {
        HealthRepositoryImpl(publicRetrofit.create(HealthApi::class.java))
    }

    val authRepository: AuthRepository by lazy {
        AuthRepositoryImpl(publicRetrofit.create(AuthApi::class.java), sessionManager)
    }

    val checkApiHealth by lazy { CheckApiHealthUseCase(healthRepository) }
    val login by lazy { LoginUseCase(authRepository) }
    val register by lazy { RegisterUseCase(authRepository) }
    val logout by lazy { LogoutUseCase(authRepository) }
    val restoreSession by lazy { RestoreSessionUseCase(authRepository) }
    val observeSession by lazy { ObserveSessionUseCase(authRepository) }
}
