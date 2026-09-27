package com.fintrack.app.data.models

import com.fintrack.app.domain.models.AccountExpense
import com.fintrack.app.domain.models.BudgetHistoryReport
import com.fintrack.app.domain.models.BudgetMonth
import com.fintrack.app.domain.models.CardExpense
import com.fintrack.app.domain.models.CashFlowReport
import com.fintrack.app.domain.models.CategoryExpense
import com.fintrack.app.domain.models.ExpensesByAccountReport
import com.fintrack.app.domain.models.ExpensesByCardReport
import com.fintrack.app.domain.models.ExpensesByCategoryReport
import com.fintrack.app.domain.models.IncomeVsExpensesReport
import com.fintrack.app.domain.models.InvestmentAccountReport
import com.fintrack.app.domain.models.InvestmentsReport
import com.fintrack.app.domain.models.MonthPoint
import com.fintrack.app.domain.models.MonthlyEvolutionReport
import com.fintrack.app.domain.models.NetWorthPoint
import com.fintrack.app.domain.models.NetWorthReport
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts/reports.ts (só os campos que o app usa). */
@Serializable
data class ReportPeriodDto(val from: String, val to: String)

@Serializable
data class CategoryExpenseDto(
    val categoryId: String? = null,
    val categoryName: String,
    val totalCents: Long,
    val accountCents: Long,
    val cardCents: Long,
    val percent: Int,
)

@Serializable
data class ExpensesByCategoryDto(val period: ReportPeriodDto, val totalCents: Long, val items: List<CategoryExpenseDto>)

@Serializable
data class IncomeVsExpensesDto(
    val period: ReportPeriodDto,
    val incomeCents: Long,
    val expenseCents: Long,
    val cardExpenseCents: Long,
    val netCents: Long,
    val savingsPercent: Int? = null,
)

@Serializable
data class MonthPointDto(
    val month: String,
    val incomeCents: Long,
    val expenseCents: Long,
    val cardExpenseCents: Long,
    val netCents: Long,
)

@Serializable
data class MonthlyEvolutionDto(val items: List<MonthPointDto>)

@Serializable
data class AccountExpenseDto(val accountId: String, val accountName: String, val totalCents: Long, val percent: Int)

@Serializable
data class ExpensesByAccountDto(val period: ReportPeriodDto, val totalCents: Long, val items: List<AccountExpenseDto>)

@Serializable
data class CardExpenseDto(val cardId: String, val cardName: String, val installmentsCents: Long, val purchasedCents: Long)

@Serializable
data class ExpensesByCardDto(
    val period: ReportPeriodDto,
    val installmentsCents: Long,
    val purchasedCents: Long,
    val items: List<CardExpenseDto>,
)

@Serializable
data class CashFlowDto(
    val period: ReportPeriodDto,
    val openingBalanceCents: Long,
    val closingBalanceCents: Long,
    val incomeCents: Long,
    val expensesCents: Long,
    val cardPaymentsCents: Long,
    val transfersOutCents: Long,
    val transfersInCents: Long,
    val netCents: Long,
)

@Serializable
data class BudgetMonthDto(
    val month: String,
    val budgetsCount: Int,
    val limitCents: Long,
    val spentCents: Long,
    val remainingCents: Long,
    val exceededCount: Int,
)

@Serializable
data class BudgetHistoryDto(val items: List<BudgetMonthDto>)

@Serializable
data class NetWorthPointDto(
    val date: String,
    val cashCents: Long,
    val investmentsCents: Long,
    val cardLiabilitiesCents: Long,
    val netWorthCents: Long,
)

@Serializable
data class NetWorthDto(val items: List<NetWorthPointDto>)

@Serializable
data class InvestmentAccountDto(
    val accountId: String,
    val accountName: String,
    val balanceCents: Long,
    val appliedCents: Long,
    val redeemedCents: Long,
    val netContributedCents: Long,
    val yieldCents: Long? = null,
)

@Serializable
data class InvestmentsDto(
    val period: ReportPeriodDto,
    val totalBalanceCents: Long,
    val appliedCents: Long,
    val redeemedCents: Long,
    val yieldCents: Long? = null,
    val items: List<InvestmentAccountDto>,
)

fun ExpensesByCategoryDto.toDomain() = ExpensesByCategoryReport(
    totalCents = totalCents,
    items = items.map { CategoryExpense(it.categoryId, it.categoryName, it.totalCents, it.accountCents, it.cardCents, it.percent) },
)

fun IncomeVsExpensesDto.toDomain() = IncomeVsExpensesReport(incomeCents, expenseCents, cardExpenseCents, netCents, savingsPercent)

fun MonthlyEvolutionDto.toDomain() = MonthlyEvolutionReport(
    items.map { MonthPoint(it.month, it.incomeCents, it.expenseCents, it.cardExpenseCents, it.netCents) },
)

fun ExpensesByAccountDto.toDomain() = ExpensesByAccountReport(
    totalCents = totalCents,
    items = items.map { AccountExpense(it.accountId, it.accountName, it.totalCents, it.percent) },
)

fun ExpensesByCardDto.toDomain() = ExpensesByCardReport(
    installmentsCents = installmentsCents,
    purchasedCents = purchasedCents,
    items = items.map { CardExpense(it.cardId, it.cardName, it.installmentsCents, it.purchasedCents) },
)

fun CashFlowDto.toDomain() = CashFlowReport(
    openingBalanceCents, closingBalanceCents, incomeCents, expensesCents, cardPaymentsCents, transfersOutCents, transfersInCents, netCents,
)

fun BudgetHistoryDto.toDomain() = BudgetHistoryReport(
    items.map { BudgetMonth(it.month, it.budgetsCount, it.limitCents, it.spentCents, it.remainingCents, it.exceededCount) },
)

fun NetWorthDto.toDomain() = NetWorthReport(
    items.map { NetWorthPoint(it.date, it.cashCents, it.investmentsCents, it.cardLiabilitiesCents, it.netWorthCents) },
)

fun InvestmentsDto.toDomain() = InvestmentsReport(
    totalBalanceCents = totalBalanceCents,
    appliedCents = appliedCents,
    redeemedCents = redeemedCents,
    yieldCents = yieldCents,
    items = items.map {
        InvestmentAccountReport(
            it.accountId, it.accountName, it.balanceCents, it.appliedCents, it.redeemedCents,
            it.netContributedCents, it.yieldCents,
        )
    },
)
