package com.fintrack.app.data.api

import com.fintrack.app.data.models.BudgetHistoryDto
import com.fintrack.app.data.models.CashFlowDto
import com.fintrack.app.data.models.ExpensesByAccountDto
import com.fintrack.app.data.models.ExpensesByCardDto
import com.fintrack.app.data.models.ExpensesByCategoryDto
import com.fintrack.app.data.models.IncomeVsExpensesDto
import com.fintrack.app.data.models.InvestmentsDto
import com.fintrack.app.data.models.MonthlyEvolutionDto
import com.fintrack.app.data.models.NetWorthDto
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

/** Relatórios (FASE 7): só leitura, calculados no backend. */
interface ReportsApi {
    @GET("api/v1/reports/expenses-by-category")
    suspend fun expensesByCategory(@Query("from") from: String?, @Query("to") to: String?): Response<ExpensesByCategoryDto>

    @GET("api/v1/reports/income-vs-expenses")
    suspend fun incomeVsExpenses(@Query("from") from: String?, @Query("to") to: String?): Response<IncomeVsExpensesDto>

    @GET("api/v1/reports/monthly-evolution")
    suspend fun monthlyEvolution(@Query("months") months: Int): Response<MonthlyEvolutionDto>

    @GET("api/v1/reports/expenses-by-account")
    suspend fun expensesByAccount(@Query("from") from: String?, @Query("to") to: String?): Response<ExpensesByAccountDto>

    @GET("api/v1/reports/expenses-by-card")
    suspend fun expensesByCard(@Query("from") from: String?, @Query("to") to: String?): Response<ExpensesByCardDto>

    @GET("api/v1/reports/cash-flow")
    suspend fun cashFlow(@Query("from") from: String?, @Query("to") to: String?): Response<CashFlowDto>

    @GET("api/v1/reports/budget-history")
    suspend fun budgetHistory(@Query("months") months: Int): Response<BudgetHistoryDto>

    @GET("api/v1/reports/net-worth")
    suspend fun netWorth(@Query("months") months: Int): Response<NetWorthDto>

    @GET("api/v1/reports/investments")
    suspend fun investments(@Query("from") from: String?, @Query("to") to: String?): Response<InvestmentsDto>
}
