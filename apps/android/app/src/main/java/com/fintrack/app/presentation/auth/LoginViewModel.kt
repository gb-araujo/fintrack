package com.fintrack.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.usecases.LoginUseCase
import com.fintrack.app.domain.validation.AuthField
import com.fintrack.app.domain.validation.ValidationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val emailError: String? = null,
    val passwordError: String? = null,
    val formError: String? = null,
    val isSubmitting: Boolean = false,
)

/**
 * Após o login bem-sucedido não há navegação explícita: o estado da sessão muda para
 * Authenticated e a raiz do app troca para o fluxo principal.
 */
class LoginViewModel(private val login: LoginUseCase) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) =
        _uiState.update { it.copy(email = value, emailError = null, formError = null) }

    fun onPasswordChange(value: String) =
        _uiState.update { it.copy(password = value, passwordError = null, formError = null) }

    fun submit() {
        val current = _uiState.value
        if (current.isSubmitting) return
        _uiState.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            login(current.email, current.password)
                .onSuccess { _uiState.update { it.copy(isSubmitting = false, password = "") } }
                .onFailure { error ->
                    _uiState.update {
                        if (error is ValidationException) {
                            it.copy(
                                isSubmitting = false,
                                emailError = error.fieldErrors[AuthField.EMAIL],
                                passwordError = error.fieldErrors[AuthField.PASSWORD],
                            )
                        } else {
                            it.copy(isSubmitting = false, formError = error.toUserMessage())
                        }
                    }
                }
        }
    }

    companion object {
        fun factory(login: LoginUseCase): ViewModelProvider.Factory =
            viewModelFactory { initializer { LoginViewModel(login) } }
    }
}
