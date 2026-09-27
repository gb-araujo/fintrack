package com.fintrack.app.presentation.investments

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.centsToInput
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation
import com.fintrack.app.domain.usecases.DeleteValuationUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListInvestmentsUseCase
import com.fintrack.app.domain.usecases.ListValuationsUseCase
import com.fintrack.app.domain.usecases.UpdateInvestmentDetailsUseCase
import com.fintrack.app.domain.usecases.UpsertValuationUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ValuationFormState(
    /** Presente ao corrigir uma avaliação existente (mesma data — nunca duplica). */
    val editing: InvestmentValuation? = null,
    val date: String,
    val balance: String = "",
    val note: String = "",
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class DetailsFormState(
    val institution: String,
    val product: String,
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class InvestmentDetailUiState(
    val isLoading: Boolean = true,
    val investment: InvestmentSummary? = null,
    /** Mais recente primeiro. */
    val valuations: List<InvestmentValuation> = emptyList(),
    val error: String? = null,
    val valuationForm: ValuationFormState? = null,
    val detailsForm: DetailsFormState? = null,
    val removing: InvestmentValuation? = null,
    val removeError: String? = null,
)

/**
 * Uma conta de investimento: resumo + histórico de avaliações (FASE 8, ADR 0020). O rendimento
 * exibido é sempre o que o backend derivou das avaliações — nada é calculado aqui.
 */
class InvestmentDetailViewModel(
    private val accountId: String,
    private val listInvestments: ListInvestmentsUseCase,
    private val listValuations: ListValuationsUseCase,
    private val upsertValuation: UpsertValuationUseCase,
    private val deleteValuation: DeleteValuationUseCase,
    private val updateDetails: UpdateInvestmentDetailsUseCase,
    private val today: () -> String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InvestmentDetailUiState())
    val uiState: StateFlow<InvestmentDetailUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val investments = listInvestments()
            val valuations = listValuations(accountId)
            val failure = investments.exceptionOrNull() ?: valuations.exceptionOrNull()
            if (failure != null) {
                _uiState.update { it.copy(isLoading = false, error = failure.toUserMessage()) }
                return@launch
            }
            _uiState.update {
                it.copy(
                    isLoading = false,
                    investment = investments.getOrDefault(emptyList()).find { item -> item.accountId == accountId },
                    valuations = valuations.getOrDefault(emptyList()).sortedByDescending { v -> v.date },
                )
            }
        }
    }

    // ---------- Registrar/corrigir avaliação ----------

    fun openValuationForm(valuation: InvestmentValuation? = null) = _uiState.update {
        it.copy(
            valuationForm = ValuationFormState(
                editing = valuation,
                date = valuation?.date ?: today(),
                balance = valuation?.let { v -> centsToInput(v.balanceCents) }.orEmpty(),
                note = valuation?.note.orEmpty(),
            ),
        )
    }

    fun closeValuationForm() = _uiState.update { it.copy(valuationForm = null) }

    fun onValuationChange(transform: (ValuationFormState) -> ValuationFormState) = _uiState.update { state ->
        state.valuationForm?.let {
            state.copy(valuationForm = transform(it).copy(errors = emptyMap(), formError = null))
        } ?: state
    }

    fun submitValuation() {
        val form = _uiState.value.valuationForm ?: return
        if (form.submitting) return
        _uiState.update { it.copy(valuationForm = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            upsertValuation(accountId, form.date, form.balance, form.note, today()).fold(
                onSuccess = {
                    _uiState.update { it.copy(valuationForm = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        val current = state.valuationForm ?: return@update state
                        state.copy(
                            valuationForm = if (error is FormValidationException) {
                                current.copy(submitting = false, errors = error.errors)
                            } else {
                                current.copy(submitting = false, formError = error.toUserMessage())
                            },
                        )
                    }
                },
            )
        }
    }

    // ---------- Remover avaliação ----------

    fun askRemove(valuation: InvestmentValuation) = _uiState.update { it.copy(removing = valuation, removeError = null) }

    fun dismissRemove() = _uiState.update { it.copy(removing = null, removeError = null) }

    fun confirmRemove() {
        val valuation = _uiState.value.removing ?: return
        viewModelScope.launch {
            deleteValuation(accountId, valuation.id).fold(
                onSuccess = {
                    _uiState.update { it.copy(removing = null) }
                    refresh()
                },
                onFailure = { error -> _uiState.update { it.copy(removeError = error.toUserMessage()) } },
            )
        }
    }

    // ---------- Instituição / produto ----------

    fun openDetailsForm() {
        val investment = _uiState.value.investment ?: return
        _uiState.update {
            it.copy(
                detailsForm = DetailsFormState(
                    institution = investment.institution.orEmpty(),
                    product = investment.product.orEmpty(),
                ),
            )
        }
    }

    fun closeDetailsForm() = _uiState.update { it.copy(detailsForm = null) }

    fun onDetailsChange(transform: (DetailsFormState) -> DetailsFormState) = _uiState.update { state ->
        state.detailsForm?.let { state.copy(detailsForm = transform(it).copy(formError = null)) } ?: state
    }

    fun submitDetails() {
        val form = _uiState.value.detailsForm ?: return
        if (form.submitting) return
        _uiState.update { it.copy(detailsForm = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            updateDetails(accountId, form.institution.trim().ifEmpty { null }, form.product.trim().ifEmpty { null })
                .fold(
                    onSuccess = {
                        _uiState.update { it.copy(detailsForm = null) }
                        refresh()
                    },
                    onFailure = { error ->
                        _uiState.update { state ->
                            val current = state.detailsForm ?: return@update state
                            state.copy(detailsForm = current.copy(submitting = false, formError = error.toUserMessage()))
                        }
                    },
                )
        }
    }

    companion object {
        fun factory(
            accountId: String,
            listInvestments: ListInvestmentsUseCase,
            listValuations: ListValuationsUseCase,
            upsertValuation: UpsertValuationUseCase,
            deleteValuation: DeleteValuationUseCase,
            updateDetails: UpdateInvestmentDetailsUseCase,
            today: () -> String,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                InvestmentDetailViewModel(
                    accountId, listInvestments, listValuations, upsertValuation, deleteValuation,
                    updateDetails, today,
                )
            }
        }
    }
}
