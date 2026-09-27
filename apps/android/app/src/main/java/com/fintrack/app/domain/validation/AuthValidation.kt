package com.fintrack.app.domain.validation

/**
 * Validação local dos formulários de autenticação — espelha os schemas de packages/shared
 * (contracts/auth.ts). É apenas conforto para o usuário: o backend é a fonte da verdade e
 * valida tudo novamente.
 */
object AuthValidation {
    const val PASSWORD_MIN_LENGTH = 8
    const val PASSWORD_MAX_LENGTH = 128
    private const val EMAIL_MAX_LENGTH = 254
    private const val NAME_MAX_LENGTH = 100
    private val EMAIL_REGEX = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")

    fun normalizeEmail(email: String): String = email.trim().lowercase()

    fun emailError(email: String): String? {
        val normalized = normalizeEmail(email)
        return when {
            normalized.isEmpty() -> "Informe o e-mail."
            normalized.length > EMAIL_MAX_LENGTH -> "E-mail muito longo."
            !EMAIL_REGEX.matches(normalized) -> "E-mail inválido."
            else -> null
        }
    }

    fun newPasswordError(password: String): String? = when {
        password.length < PASSWORD_MIN_LENGTH ->
            "A senha deve ter pelo menos $PASSWORD_MIN_LENGTH caracteres."
        password.length > PASSWORD_MAX_LENGTH ->
            "A senha deve ter no máximo $PASSWORD_MAX_LENGTH caracteres."
        else -> null
    }

    fun loginPasswordError(password: String): String? = when {
        password.isEmpty() -> "Informe a senha."
        password.length > PASSWORD_MAX_LENGTH -> "Senha inválida."
        else -> null
    }

    fun nameError(name: String): String? {
        val trimmed = name.trim()
        return when {
            trimmed.isEmpty() -> "Informe o nome."
            trimmed.length > NAME_MAX_LENGTH -> "Nome muito longo."
            else -> null
        }
    }
}

enum class AuthField { NAME, EMAIL, PASSWORD }

/** Erros de validação por campo, lançados pelos casos de uso antes de chamar a API. */
class ValidationException(val fieldErrors: Map<AuthField, String>) :
    Exception("Dados inválidos: ${fieldErrors.keys}")
