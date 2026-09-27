package com.fintrack.app.presentation.investments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.usecases.ListInvestmentsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class InvestmentsUiState(
    val isLoading: Boolean = true,
    val items: List<InvestmentSummary> = emptyList(),
    val error: String? = null,
)

/** Lista de contas de investimento (FASE 8): saldo, aportado e rendimento — calculados no backend. */
class InvestmentsViewModel(
    private val listInvestments: ListInvestmentsUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InvestmentsUiState())
    val uiState: StateFlow<InvestmentsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            listInvestments().fold(
                onSuccess = { items -> _uiState.update { it.copy(isLoading = false, items = items) } },
                onFailure = { error -> _uiState.update { it.copy(isLoading = false, error = error.toUserMessage()) } },
            )
        }
    }

    companion object {
        fun factory(listInvestments: ListInvestmentsUseCase): ViewModelProvider.Factory = viewModelFactory {
            initializer { InvestmentsViewModel(listInvestments) }
        }
    }
}
