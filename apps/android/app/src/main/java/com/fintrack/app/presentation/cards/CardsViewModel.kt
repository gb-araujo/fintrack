package com.fintrack.app.presentation.cards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.usecases.CreateCardUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCardsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class CardFormState(
    val name: String = "",
    val limit: String = "",
    val closingDay: String = "",
    val dueDay: String = "",
    val paymentAccountId: String? = null,
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class CardsUiState(
    val isLoading: Boolean = true,
    val cards: List<CreditCard> = emptyList(),
    /** Contas que podem pagar fatura (banco/carteira). */
    val paymentAccounts: List<Account> = emptyList(),
    val error: String? = null,
    val form: CardFormState? = null,
)

class CardsViewModel(
    private val listCards: ListCardsUseCase,
    private val createCard: CreateCardUseCase,
    private val listAccounts: ListAccountsUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CardsUiState())
    val uiState: StateFlow<CardsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            listAccounts().onSuccess { accounts ->
                _uiState.update { it.copy(paymentAccounts = accounts.filter { a -> a.type != AccountType.INVESTMENT }) }
            }
            listCards().fold(
                onSuccess = { cards -> _uiState.update { it.copy(isLoading = false, cards = cards) } },
                onFailure = { error -> _uiState.update { it.copy(isLoading = false, error = error.toUserMessage()) } },
            )
        }
    }

    fun openForm() = _uiState.update { it.copy(form = CardFormState()) }

    fun closeForm() = _uiState.update { it.copy(form = null) }

    fun onFormChange(transform: (CardFormState) -> CardFormState) = _uiState.update { state ->
        state.form?.let { state.copy(form = transform(it).copy(errors = emptyMap(), formError = null)) } ?: state
    }

    fun submit() {
        val form = _uiState.value.form ?: return
        if (form.submitting) return
        _uiState.update { it.copy(form = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            createCard(form.name, form.limit, form.closingDay, form.dueDay, form.paymentAccountId).fold(
                onSuccess = {
                    _uiState.update { it.copy(form = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        val current = state.form ?: return@update state
                        state.copy(
                            form = if (error is FormValidationException) {
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

    companion object {
        fun factory(
            listCards: ListCardsUseCase,
            createCard: CreateCardUseCase,
            listAccounts: ListAccountsUseCase,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { CardsViewModel(listCards, createCard, listAccounts) }
        }
    }
}
