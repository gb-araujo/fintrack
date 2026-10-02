package com.fintrack.app.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
import com.fintrack.app.domain.usecases.GetDashboardUseCase
import com.fintrack.app.domain.usecases.LogoutUseCase
import com.fintrack.app.domain.usecases.ObserveSessionUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ApiStatus {
    data object Checking : ApiStatus
    data class Online(val version: String) : ApiStatus
    data class Degraded(val version: String, val databaseAvailable: Boolean) : ApiStatus
    data class Offline(val message: String) : ApiStatus
}

data class DashboardUiState(
    val userName: String? = null,
    val apiStatus: ApiStatus = ApiStatus.Checking,
    val isRefreshing: Boolean = false,
    val isLoggingOut: Boolean = false,
    /** Vem pronto do servidor: o app nunca recalcula o dinheiro disponível. */
    val summary: DashboardSummary? = null,
    val summaryError: String? = null,
)

class DashboardViewModel(
    private val checkApiHealth: CheckApiHealthUseCase,
    private val observeSession: ObserveSessionUseCase,
    private val logout: LogoutUseCase,
    private val getDashboard: GetDashboardUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            observeSession().collect { session ->
                val name = (session as? SessionState.Authenticated)?.user?.name
                _uiState.update { it.copy(userName = name) }
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, summaryError = null) }
            val summary = getDashboard()
            val status = checkApiHealth().fold(
                onSuccess = { health ->
                    if (health.isHealthy) {
                        ApiStatus.Online(health.version)
                    } else {
                        ApiStatus.Degraded(health.version, health.databaseAvailable)
                    }
                },
                onFailure = { ApiStatus.Offline("Não foi possível conectar à API.") },
            )
            _uiState.update {
                it.copy(
                    apiStatus = status,
                    isRefreshing = false,
                    summary = summary.getOrNull() ?: it.summary,
                    summaryError = summary.exceptionOrNull()?.toUserMessage(),
                )
            }
        }
    }

    /** A navegação volta ao login sozinha quando a sessão vira Unauthenticated. */
    fun logout() {
        if (_uiState.value.isLoggingOut) return
        _uiState.update { it.copy(isLoggingOut = true) }
        viewModelScope.launch { logout.invoke() }
    }

    companion object {
        fun factory(
            checkApiHealth: CheckApiHealthUseCase,
            observeSession: ObserveSessionUseCase,
            logout: LogoutUseCase,
            getDashboard: GetDashboardUseCase,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { DashboardViewModel(checkApiHealth, observeSession, logout, getDashboard) }
        }
    }
}
