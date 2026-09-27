package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.PayableInvoice

/** O servidor lê o CSV, sugere e detecta duplicatas; nada vira lançamento antes de confirmar. */
interface ImportsRepository {
    suspend fun create(accountId: String, filename: String, content: String): ImportReview

    /** Confirma com uma decisão por linha (`rowId → escolha`); tudo ou nada. */
    suspend fun confirm(importId: String, choices: Map<String, ImportChoice>): ImportResult

    suspend fun cancel(importId: String)

    suspend fun payableInvoices(): List<PayableInvoice>
}
