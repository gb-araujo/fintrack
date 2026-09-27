package com.fintrack.app.presentation.accounts

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.usecases.CreateAccountUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class AccountFormState(
    val name: String = "",
    val type: AccountType = AccountType.BANK,
    val balance: String = "",
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class AccountsUiState(
    val isLoading: Boolean = true,
    val accounts: List<Account> = emptyList(),
    val error: String? = null,
    val form: AccountFormState? = null,
)

class AccountsViewModel(
    private val listAccounts: ListAccountsUseCase,
    private val createAccount: CreateAccountUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(AccountsUiState())
    val uiState: StateFlow<AccountsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            listAccounts().fold(
                onSuccess = { accounts -> _uiState.update { it.copy(isLoading = false, accounts = accounts) } },
                onFailure = { error -> _uiState.update { it.copy(isLoading = false, error = error.toUserMessage()) } },
            )
        }
    }

    fun openForm() = _uiState.update { it.copy(form = AccountFormState()) }

    fun closeForm() = _uiState.update { it.copy(form = null) }

    fun onFormChange(transform: (AccountFormState) -> AccountFormState) =
        _uiState.update { state -> state.form?.let { state.copy(form = transform(it).copy(errors = emptyMap(), formError = null)) } ?: state }

    fun submit() {
        val form = _uiState.value.form ?: return
        if (form.submitting) return
        _uiState.update { it.copy(form = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            createAccount(form.name, form.type, form.balance).fold(
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
        fun factory(list: ListAccountsUseCase, create: CreateAccountUseCase): ViewModelProvider.Factory =
            viewModelFactory { initializer { AccountsViewModel(list, create) } }
    }
}
