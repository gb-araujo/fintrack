package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.parseMoneyToCents
import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation
import com.fintrack.app.domain.repositories.InvestmentsRepository

/** Um caso de uso por operação (FASE 8): apenas delega — o rendimento é calculado no backend. */
class ListInvestmentsUseCase(private val repository: InvestmentsRepository) {
    suspend operator fun invoke(): Result<List<InvestmentSummary>> =
        suspendRunCatching { repository.list() }
}

class ListValuationsUseCase(private val repository: InvestmentsRepository) {
    suspend operator fun invoke(accountId: String): Result<List<InvestmentValuation>> =
        suspendRunCatching { repository.valuations(accountId) }
}

/** Erros por campo: "date" e "balance". Saldo pode ser zero (posição totalmente resgatada). */
class UpsertValuationUseCase(private val repository: InvestmentsRepository) {
    suspend operator fun invoke(
        accountId: String,
        date: String,
        balanceText: String,
        note: String?,
        today: String,
    ): Result<InvestmentValuation> = suspendRunCatching {
        val errors = mutableMapOf<String, String>()
        if (!validDate(date)) errors["date"] = "Informe a data."
        else if (date > today) errors["date"] = "A data não pode ser no futuro."
        val cents = parseMoneyToCents(balanceText)
        if (balanceText.isBlank()) errors["balance"] = "Informe o valor."
        else if (cents == null) errors["balance"] = "Valor inválido. Use o formato 1.234,56."
        else if (cents < 0) errors["balance"] = "O valor deve ser positivo."
        if (errors.isNotEmpty()) throw FormValidationException(errors)
        repository.upsertValuation(accountId, date, cents!!, note?.trim()?.ifEmpty { null })
    }
}

class DeleteValuationUseCase(private val repository: InvestmentsRepository) {
    suspend operator fun invoke(accountId: String, id: String): Result<Unit> =
        suspendRunCatching { repository.deleteValuation(accountId, id) }
}

class UpdateInvestmentDetailsUseCase(private val repository: InvestmentsRepository) {
    suspend operator fun invoke(
        accountId: String,
        institution: String?,
        product: String?,
    ): Result<InvestmentSummary> =
        suspendRunCatching { repository.updateDetails(accountId, institution, product) }
}
