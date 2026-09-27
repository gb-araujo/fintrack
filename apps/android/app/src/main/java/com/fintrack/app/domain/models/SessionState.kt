package com.fintrack.app.domain.models

/** Estado da sessão do app — decide qual fluxo de navegação é exibido. */
sealed interface SessionState {
    /** Ainda restaurando a sessão salva (splash). */
    data object Restoring : SessionState

    data class Authenticated(val user: User) : SessionState

    data object Unauthenticated : SessionState

    /** Há sessão salva, mas não foi possível falar com a API (ex.: sem internet). */
    data class Unreachable(val message: String) : SessionState
}
