package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.ImportRowType
import com.fintrack.app.domain.models.PayableInvoice
import com.fintrack.app.domain.repositories.ImportsRepository

/** Lê o extrato (CSV) e cria uma importação EM REVISÃO. Erros por campo: "account" e "file". */
class CreateImportUseCase(private val repository: ImportsRepository) {
    suspend operator fun invoke(accountId: String?, filename: String, content: String): Result<ImportReview> =
        suspendRunCatching {
            val errors = mutableMapOf<String, String>()
            if (accountId.isNullOrEmpty()) errors["account"] = "Escolha a conta do extrato."
            if (content.isBlank()) errors["file"] = "O arquivo está vazio."
            if (errors.isNotEmpty()) throw FormValidationException(errors)
            repository.create(accountId!!, filename.ifBlank { "extrato.csv" }, content)
        }
}

/**
 * Confirma a revisão. Antes de chamar a API, confere o que o servidor também confere: transferência
 * precisa da outra conta e pagamento de fatura precisa da fatura. Erros vêm por `rowId`.
 */
class ConfirmImportUseCase(private val repository: ImportsRepository) {
    suspend operator fun invoke(review: ImportReview, choices: Map<String, ImportChoice>): Result<ImportResult> =
        suspendRunCatching {
            val errors = mutableMapOf<String, String>()
            for (row in review.rows) {
                val choice = choices[row.id] ?: continue
                if (!choice.import) continue
                if (choice.type == ImportRowType.TRANSFER && choice.targetAccountId.isNullOrEmpty()) {
                    errors[row.id] = "Escolha a outra conta."
                }
                if (choice.type == ImportRowType.CARD_PAYMENT && choice.invoiceId.isNullOrEmpty()) {
                    errors[row.id] = "Escolha a fatura."
                }
            }
            if (errors.isNotEmpty()) throw FormValidationException(errors)
            repository.confirm(review.id, choices)
        }
}

class CancelImportUseCase(private val repository: ImportsRepository) {
    suspend operator fun invoke(importId: String): Result<Unit> =
        suspendRunCatching { repository.cancel(importId) }
}

class ListPayableInvoicesUseCase(private val repository: ImportsRepository) {
    suspend operator fun invoke(): Result<List<PayableInvoice>> =
        suspendRunCatching { repository.payableInvoices() }
}
