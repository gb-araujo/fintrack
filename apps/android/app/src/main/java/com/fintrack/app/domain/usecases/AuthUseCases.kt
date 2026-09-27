package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.SessionState
import com.fintrack.app.domain.models.User
import com.fintrack.app.domain.repositories.AuthRepository
import com.fintrack.app.domain.validation.AuthField
import com.fintrack.app.domain.validation.AuthValidation
import com.fintrack.app.domain.validation.ValidationException
import kotlinx.coroutines.flow.StateFlow

class LoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(email: String, password: String): Result<User> = suspendRunCatching {
        val errors = buildMap {
            AuthValidation.emailError(email)?.let { put(AuthField.EMAIL, it) }
            AuthValidation.loginPasswordError(password)?.let { put(AuthField.PASSWORD, it) }
        }
        if (errors.isNotEmpty()) throw ValidationException(errors)
        repository.login(AuthValidation.normalizeEmail(email), password)
    }
}

class RegisterUseCase(
    private val repository: AuthRepository,
    private val deviceTimeZone: () -> String? = { java.time.ZoneId.systemDefault().id },
) {
    suspend operator fun invoke(name: String, email: String, password: String): Result<User> =
        suspendRunCatching {
            val errors = buildMap {
                AuthValidation.nameError(name)?.let { put(AuthField.NAME, it) }
                AuthValidation.emailError(email)?.let { put(AuthField.EMAIL, it) }
                AuthValidation.newPasswordError(password)?.let { put(AuthField.PASSWORD, it) }
            }
            if (errors.isNotEmpty()) throw ValidationException(errors)
            repository.register(
                name = name.trim(),
                email = AuthValidation.normalizeEmail(email),
                password = password,
                timezone = deviceTimeZone(),
            )
        }
}

class LogoutUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke() = repository.logout()
}

class RestoreSessionUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke() = repository.restoreSession()
}

class ObserveSessionUseCase(private val repository: AuthRepository) {
    operator fun invoke(): StateFlow<SessionState> = repository.sessionState
}
