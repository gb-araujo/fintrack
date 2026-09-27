package com.fintrack.app.core.utils

import com.fintrack.app.core.network.ApiException
import java.io.IOException

/** Mensagem amigável para exibir ao usuário (as mensagens da API já vêm em português). */
fun Throwable.toUserMessage(): String = when (this) {
    is ApiException -> message
    is IOException -> "Sem conexão com o servidor. Verifique sua internet e tente novamente."
    else -> "Algo deu errado. Tente novamente."
}
