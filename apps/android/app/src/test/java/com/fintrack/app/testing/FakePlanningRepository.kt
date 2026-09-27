package com.fintrack.app.testing

import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetStatus
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Occurrence
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.repositories.PlanningRepository

fun budget(
    id: String = "bud-1",
    categoryId: String = "cat-1",
    categoryName: String = "Alimentação",
    limit: Long = 80_000,
    spent: Long = 20_000,
    percent: Int = 25,
    status: BudgetStatus = BudgetStatus.OK,
    pending: Long = 0,
) = Budget(id, categoryId, categoryName, limit, spent, pending, limit - spent, percent, status)

fun budgetSummary(month: String, items: List<Budget> = listOf(budget()), unbudgeted: Long = 0) = BudgetSummary(
    month = month,
    items = items,
    limitCents = items.sumOf { it.limitCents },
    spentCents = items.sumOf { it.spentCents },
    remainingCents = items.sumOf { it.remainingCents },
    unbudgetedSpentCents = unbudgeted,
)

fun occurrence(
    recurringId: String = "rec-1",
    name: String = "Aluguel",
    date: String = "2026-09-25",
    amount: Long = 150_000,
    type: TransactionType = TransactionType.EXPENSE,
    estimated: Boolean = false,
    overdue: Boolean = false,
) = Occurrence(recurringId, name, type, date, amount, estimated, accountId = "acc-1", overdue = overdue)

class FakePlanningRepository : PlanningRepository {
    var budgetsProvider: (String) -> BudgetSummary = { month -> budgetSummary(month) }
    var occurrences: List<Occurrence> = listOf(occurrence(overdue = true), occurrence("rec-2", "Enel", "2026-10-05", 18_000, estimated = true))
    var failure: Throwable? = null

    val requestedMonths = mutableListOf<String>()
    val savedBudgets = mutableListOf<Triple<String, String, Long>>()
    val confirmed = mutableListOf<List<Any>>()
    val skipped = mutableListOf<Pair<String, String>>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun budgets(month: String): BudgetSummary {
        maybeFail()
        requestedMonths += month
        return budgetsProvider(month)
    }

    override suspend fun saveBudget(categoryId: String, month: String, limitCents: Long): Budget {
        maybeFail()
        savedBudgets += Triple(categoryId, month, limitCents)
        return budget(categoryId = categoryId, limit = limitCents)
    }

    override suspend fun occurrences(): List<Occurrence> {
        maybeFail()
        return occurrences
    }

    override suspend fun confirmOccurrence(recurringId: String, date: String, amountCents: Long, transactionDate: String) {
        maybeFail()
        confirmed += listOf(recurringId, date, amountCents, transactionDate)
    }

    override suspend fun skipOccurrence(recurringId: String, date: String) {
        maybeFail()
        skipped += recurringId to date
    }
}
