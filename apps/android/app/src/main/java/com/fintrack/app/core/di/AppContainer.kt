package com.fintrack.app.core.di

import com.fintrack.app.core.network.NetworkModule
import com.fintrack.app.data.api.HealthApi
import com.fintrack.app.data.repositories.HealthRepositoryImpl
import com.fintrack.app.domain.repositories.HealthRepository
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase

/**
 * Injeção de dependências manual. Simples o bastante para o início do projeto;
 * pode ser migrado para Hilt quando o número de dependências crescer.
 */
class AppContainer(
    baseUrl: String,
    enableHttpLogging: Boolean,
) {
    private val retrofit by lazy {
        NetworkModule.retrofit(baseUrl, NetworkModule.okHttpClient(enableHttpLogging))
    }

    val healthRepository: HealthRepository by lazy {
        HealthRepositoryImpl(retrofit.create(HealthApi::class.java))
    }

    val checkApiHealth: CheckApiHealthUseCase by lazy { CheckApiHealthUseCase(healthRepository) }
}
