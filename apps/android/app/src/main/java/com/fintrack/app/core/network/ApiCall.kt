package com.fintrack.app.core.network

import com.fintrack.app.data.models.ApiErrorEnvelopeDto
import kotlinx.serialization.SerializationException
import retrofit2.Response

/**
 * Executa uma chamada Retrofit e devolve o corpo, ou lança [ApiException] com o código e a
 * mensagem do envelope de erro da API. Falhas de rede continuam como IOException.
 */
suspend fun <T : Any> apiCall(block: suspend () -> Response<T>): T {
    val response = block()
    if (response.isSuccessful) {
        return response.body()
            ?: throw ApiException(response.code(), "EMPTY_BODY", "Resposta vazia da API.")
    }
    throw response.toApiException()
}

fun Response<*>.toApiException(): ApiException {
    val raw = errorBody()?.string().orEmpty()
    val envelope = try {
        NetworkModule.json.decodeFromString<ApiErrorEnvelopeDto>(raw)
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }
    return ApiException(
        statusCode = code(),
        code = envelope?.error?.code ?: "HTTP_ERROR",
        message = envelope?.error?.message ?: "Erro ${code()} ao chamar a API.",
    )
}
