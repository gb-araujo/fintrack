package com.fintrack.app.presentation.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.domain.usecases.CheckApiHealthUseCase
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
    val apiStatus: ApiStatus = ApiStatus.Checking,
    val isRefreshing: Boolean = false,
)

class DashboardViewModel(
    private val checkApiHealth: CheckApiHealthUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
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
            _uiState.update { it.copy(apiStatus = status, isRefreshing = false) }
        }
    }

    companion object {
        fun factory(checkApiHealth: CheckApiHealthUseCase): ViewModelProvider.Factory =
            viewModelFactory { initializer { DashboardViewModel(checkApiHealth) } }
    }
}
