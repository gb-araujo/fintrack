package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.repositories.PlanningRepository

class GetBudgetsUseCase(private val repository: PlanningRepository) {
    suspend operator fun invoke(month: String): Result<BudgetSummary> =
        suspendRunCatching { repository.budgets(month) }
}

/** Define (ou altera) o limite mensal de uma categoria. Erros por campo: "category" e "limit". */
class SaveBudgetUseCase(private val repository: PlanningRepository) {
    suspend operator fun invoke(categoryId: String?, month: String, limitText: String): Result<Budget> =
        suspendRunCatching {
            val errors = mutableMapOf<String, String>()
            if (categoryId.isNullOrEmpty()) errors["category"] = "Escolha a categoria."
            val (cents, limitMessage) = amountError(limitText)
            if (limitMessage != null) errors["limit"] = limitMessage
            if (errors.isNotEmpty()) throw FormValidationException(errors)
            repository.saveBudget(categoryId!!, month, cents!!)
        }
}

class ListOccurrencesUseCase(private val repository: PlanningRepository) {
    suspend operator fun invoke(): Result<List<Occurrence>> = suspendRunCatching { repository.occurrences() }
}

/**
 * Confirma uma ocorrência prevista (vira lançamento efetivado). Erros por campo: "amount" e "date".
 * Nada é efetivado no futuro: a data não pode passar de hoje (o servidor aplica a mesma regra).
 */
class ConfirmOccurrenceUseCase(private val repository: PlanningRepository) {
    suspend operator fun invoke(occurrence: Occurrence, amountText: String, date: String, today: String): Result<Unit> =
        suspendRunCatching {
            val errors = mutableMapOf<String, String>()
            val (cents, amountMessage) = amountError(amountText)
            if (amountMessage != null) errors["amount"] = amountMessage
            if (!validDate(date)) errors["date"] = "Informe a data (AAAA-MM-DD)."
            else if (date > today) errors["date"] = "A data não pode ser futura."
            if (errors.isNotEmpty()) throw FormValidationException(errors)
            repository.confirmOccurrence(occurrence.recurringId, occurrence.date, cents!!, date)
        }
}

class SkipOccurrenceUseCase(private val repository: PlanningRepository) {
    suspend operator fun invoke(occurrence: Occurrence): Result<Unit> =
        suspendRunCatching { repository.skipOccurrence(occurrence.recurringId, occurrence.date) }
}
