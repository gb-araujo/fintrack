package com.fintrack.app.core.network

/** Erro HTTP da API FINTRACK (envelope `{ error: { code, message } }`). */
class ApiException(
    val statusCode: Int,
    val code: String,
    override val message: String,
) : Exception(message)
