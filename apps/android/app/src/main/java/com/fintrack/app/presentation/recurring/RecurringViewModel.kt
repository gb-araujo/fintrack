package com.fintrack.app.presentation.recurring

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.centsToInput
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.usecases.ConfirmOccurrenceUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListOccurrencesUseCase
import com.fintrack.app.domain.usecases.SkipOccurrenceUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ConfirmFormState(
    val occurrence: Occurrence,
    val amount: String,
    val date: String,
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class SkipState(
    val occurrence: Occurrence,
    val error: String? = null,
    val submitting: Boolean = false,
)

data class RecurringUiState(
    val isLoading: Boolean = true,
    val occurrences: List<Occurrence> = emptyList(),
    val accountNames: Map<String, String> = emptyMap(),
    val error: String? = null,
    val confirming: ConfirmFormState? = null,
    val skipping: SkipState? = null,
)

class RecurringViewModel(
    private val listOccurrences: ListOccurrencesUseCase,
    private val listAccounts: ListAccountsUseCase,
    private val confirmOccurrence: ConfirmOccurrenceUseCase,
    private val skipOccurrence: SkipOccurrenceUseCase,
    private val today: () -> String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecurringUiState())
    val uiState: StateFlow<RecurringUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            listAccounts(includeArchived = true).onSuccess { accounts ->
                _uiState.update { it.copy(accountNames = accounts.associate { account -> account.id to account.name }) }
            }
            listOccurrences().fold(
                onSuccess = { items -> _uiState.update { it.copy(isLoading = false, occurrences = items) } },
                onFailure = { error -> _uiState.update { it.copy(isLoading = false, error = error.toUserMessage()) } },
            )
        }
    }

    // ---------- Confirmar ----------

    /** Valor e data já vêm preenchidos; ocorrência futura só pode ser efetivada com data até hoje. */
    fun startConfirm(occurrence: Occurrence) {
        val now = today()
        _uiState.update {
            it.copy(
                confirming = ConfirmFormState(
                    occurrence = occurrence,
                    amount = if (occurrence.amountCents > 0) centsToInput(occurrence.amountCents) else "",
                    date = if (occurrence.date > now) now else occurrence.date,
                ),
            )
        }
    }

    fun cancelConfirm() = _uiState.update { it.copy(confirming = null) }

    fun onConfirmChange(transform: (ConfirmFormState) -> ConfirmFormState) = _uiState.update { state ->
        state.confirming?.let { state.copy(confirming = transform(it).copy(errors = emptyMap(), formError = null)) } ?: state
    }

    fun submitConfirm() {
        val form = _uiState.value.confirming ?: return
        if (form.submitting) return
        _uiState.update { it.copy(confirming = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            confirmOccurrence(form.occurrence, form.amount, form.date, today()).fold(
                onSuccess = {
                    _uiState.update { it.copy(confirming = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        val current = state.confirming ?: return@update state
                        state.copy(
                            confirming = if (error is FormValidationException) {
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

    // ---------- Pular ----------

    fun startSkip(occurrence: Occurrence) = _uiState.update { it.copy(skipping = SkipState(occurrence)) }

    fun cancelSkip() = _uiState.update { it.copy(skipping = null) }

    fun confirmSkip() {
        val skipping = _uiState.value.skipping ?: return
        if (skipping.submitting) return
        _uiState.update { it.copy(skipping = skipping.copy(submitting = true, error = null)) }
        viewModelScope.launch {
            skipOccurrence(skipping.occurrence).fold(
                onSuccess = {
                    _uiState.update { it.copy(skipping = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        state.copy(skipping = state.skipping?.copy(submitting = false, error = error.toUserMessage()))
                    }
                },
            )
        }
    }

    companion object {
        fun factory(
            listOccurrences: ListOccurrencesUseCase,
            listAccounts: ListAccountsUseCase,
            confirmOccurrence: ConfirmOccurrenceUseCase,
            skipOccurrence: SkipOccurrenceUseCase,
            today: () -> String,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { RecurringViewModel(listOccurrences, listAccounts, confirmOccurrence, skipOccurrence, today) }
        }
    }
}
