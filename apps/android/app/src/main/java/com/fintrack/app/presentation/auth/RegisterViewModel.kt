package com.fintrack.app.presentation.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.usecases.RegisterUseCase
import com.fintrack.app.domain.validation.AuthField
import com.fintrack.app.domain.validation.ValidationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class RegisterUiState(
    val name: String = "",
    val email: String = "",
    val password: String = "",
    val nameError: String? = null,
    val emailError: String? = null,
    val passwordError: String? = null,
    val formError: String? = null,
    val isSubmitting: Boolean = false,
)

class RegisterViewModel(private val register: RegisterUseCase) : ViewModel() {

    private val _uiState = MutableStateFlow(RegisterUiState())
    val uiState: StateFlow<RegisterUiState> = _uiState.asStateFlow()

    fun onNameChange(value: String) =
        _uiState.update { it.copy(name = value, nameError = null, formError = null) }

    fun onEmailChange(value: String) =
        _uiState.update { it.copy(email = value, emailError = null, formError = null) }

    fun onPasswordChange(value: String) =
        _uiState.update { it.copy(password = value, passwordError = null, formError = null) }

    fun submit() {
        val current = _uiState.value
        if (current.isSubmitting) return
        _uiState.update { it.copy(isSubmitting = true, formError = null) }
        viewModelScope.launch {
            register(current.name, current.email, current.password)
                .onSuccess { _uiState.update { it.copy(isSubmitting = false, password = "") } }
                .onFailure { error ->
                    _uiState.update {
                        if (error is ValidationException) {
                            it.copy(
                                isSubmitting = false,
                                nameError = error.fieldErrors[AuthField.NAME],
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
        fun factory(register: RegisterUseCase): ViewModelProvider.Factory =
            viewModelFactory { initializer { RegisterViewModel(register) } }
    }
}
