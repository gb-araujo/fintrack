package com.fintrack.app.domain.models

/**
 * Relatórios (FASE 7): tudo calculado no backend, com as mesmas regras do painel, do orçamento e
 * das faturas. O app só formata e exibe.
 */
data class CategoryExpense(
    val categoryId: String?,
    val categoryName: String,
    val totalCents: Long,
    val accountCents: Long,
    val cardCents: Long,
    val percent: Int,
)

data class ExpensesByCategoryReport(val totalCents: Long, val items: List<CategoryExpense>)

data class IncomeVsExpensesReport(
    val incomeCents: Long,
    val expenseCents: Long,
    val cardExpenseCents: Long,
    val netCents: Long,
    /** null = sem receitas no período. */
    val savingsPercent: Int?,
)

data class MonthPoint(
    /** AAAA-MM */
    val month: String,
    val incomeCents: Long,
    val expenseCents: Long,
    val cardExpenseCents: Long,
    val netCents: Long,
)

data class MonthlyEvolutionReport(val items: List<MonthPoint>)

data class AccountExpense(val accountId: String, val accountName: String, val totalCents: Long, val percent: Int)

data class ExpensesByAccountReport(val totalCents: Long, val items: List<AccountExpense>)

data class CardExpense(
    val cardId: String,
    val cardName: String,
    val installmentsCents: Long,
    /** INFORMATIVO: não soma em nenhuma despesa. */
    val purchasedCents: Long,
)

data class ExpensesByCardReport(
    val installmentsCents: Long,
    val purchasedCents: Long,
    val items: List<CardExpense>,
)

data class CashFlowReport(
    val openingBalanceCents: Long,
    val closingBalanceCents: Long,
    val incomeCents: Long,
    val expensesCents: Long,
    val cardPaymentsCents: Long,
    val transfersOutCents: Long,
    val transfersInCents: Long,
    val netCents: Long,
)

data class BudgetMonth(
    val month: String,
    val budgetsCount: Int,
    val limitCents: Long,
    val spentCents: Long,
    val remainingCents: Long,
    val exceededCount: Int,
)

data class BudgetHistoryReport(val items: List<BudgetMonth>)

data class NetWorthPoint(
    val date: String,
    val cashCents: Long,
    val investmentsCents: Long,
    val cardLiabilitiesCents: Long,
    val netWorthCents: Long,
)

data class NetWorthReport(val items: List<NetWorthPoint>)

data class InvestmentAccountReport(
    val accountId: String,
    val accountName: String,
    val balanceCents: Long,
    val appliedCents: Long,
    val redeemedCents: Long,
    val netContributedCents: Long,
)

data class InvestmentsReport(
    val totalBalanceCents: Long,
    val appliedCents: Long,
    val redeemedCents: Long,
    val items: List<InvestmentAccountReport>,
)

/** Período usado nos relatórios por data; vazio = padrão do backend (mês corrente). */
data class ReportPeriod(val from: String? = null, val to: String? = null)
