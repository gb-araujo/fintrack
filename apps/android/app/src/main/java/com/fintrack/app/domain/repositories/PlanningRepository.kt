package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Occurrence

interface PlanningRepository {
    /** Orçamentos do mês (AAAA-MM): o servidor calcula gasto, restante e percentual. */
    suspend fun budgets(month: String): BudgetSummary

    suspend fun saveBudget(categoryId: String, month: String, limitCents: Long): Budget

    /** Previsões (ocorrências sem lançamento): atrasadas e próximas. */
    suspend fun occurrences(): List<Occurrence>

    /** Cria o lançamento efetivado vinculado à ocorrência. */
    suspend fun confirmOccurrence(recurringId: String, date: String, amountCents: Long, transactionDate: String)

    /** Pula a ocorrência (fica registrada como cancelada; não conta em nada). */
    suspend fun skipOccurrence(recurringId: String, date: String)
}
