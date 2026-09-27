package com.fintrack.app.presentation.reports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.BudgetHistoryReport
import com.fintrack.app.domain.models.CashFlowReport
import com.fintrack.app.domain.models.ExpensesByAccountReport
import com.fintrack.app.domain.models.ExpensesByCardReport
import com.fintrack.app.domain.models.ExpensesByCategoryReport
import com.fintrack.app.domain.models.IncomeVsExpensesReport
import com.fintrack.app.domain.models.InvestmentsReport
import com.fintrack.app.domain.models.MonthlyEvolutionReport
import com.fintrack.app.domain.models.NetWorthReport
import com.fintrack.app.domain.models.ReportPeriod
import com.fintrack.app.domain.usecases.GetBudgetHistoryUseCase
import com.fintrack.app.domain.usecases.GetCashFlowUseCase
import com.fintrack.app.domain.usecases.GetExpensesByAccountUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCardUseCase
import com.fintrack.app.domain.usecases.GetExpensesByCategoryUseCase
import com.fintrack.app.domain.usecases.GetIncomeVsExpensesUseCase
import com.fintrack.app.domain.usecases.GetInvestmentsReportUseCase
import com.fintrack.app.domain.usecases.GetMonthlyEvolutionUseCase
import com.fintrack.app.domain.usecases.GetNetWorthUseCase
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class ReportTab(val label: String) {
    EXPENSES_BY_CATEGORY("Despesas por categoria"),
    INCOME_VS_EXPENSES("Receitas × despesas"),
    MONTHLY_EVOLUTION("Evolução mensal"),
    EXPENSES_BY_ACCOUNT("Despesas por conta"),
    EXPENSES_BY_CARD("Gastos por cartão"),
    CASH_FLOW("Fluxo de caixa"),
    BUDGET_HISTORY("Orçamento"),
    NET_WORTH("Patrimônio"),
    INVESTMENTS("Investimentos"),
}

/** As abas por data (as demais usam "últimos N meses"). */
private val PERIOD_TABS = setOf(
    ReportTab.EXPENSES_BY_CATEGORY,
    ReportTab.INCOME_VS_EXPENSES,
    ReportTab.EXPENSES_BY_ACCOUNT,
    ReportTab.EXPENSES_BY_CARD,
    ReportTab.CASH_FLOW,
    ReportTab.INVESTMENTS,
)

data class ReportsUiState(
    val tab: ReportTab = ReportTab.EXPENSES_BY_CATEGORY,
    val period: ReportPeriod = ReportPeriod(),
    val months: Int = 12,
    val isLoading: Boolean = true,
    val error: String? = null,
    val expensesByCategory: ExpensesByCategoryReport? = null,
    val incomeVsExpenses: IncomeVsExpensesReport? = null,
    val monthlyEvolution: MonthlyEvolutionReport? = null,
    val expensesByAccount: ExpensesByAccountReport? = null,
    val expensesByCard: ExpensesByCardReport? = null,
    val cashFlow: CashFlowReport? = null,
    val budgetHistory: BudgetHistoryReport? = null,
    val netWorth: NetWorthReport? = null,
    val investments: InvestmentsReport? = null,
) {
    val isPeriodTab: Boolean get() = tab in PERIOD_TABS
}

class ReportsViewModel(
    private val getExpensesByCategory: GetExpensesByCategoryUseCase,
    private val getIncomeVsExpenses: GetIncomeVsExpensesUseCase,
    private val getMonthlyEvolution: GetMonthlyEvolutionUseCase,
    private val getExpensesByAccount: GetExpensesByAccountUseCase,
    private val getExpensesByCard: GetExpensesByCardUseCase,
    private val getCashFlow: GetCashFlowUseCase,
    private val getBudgetHistory: GetBudgetHistoryUseCase,
    private val getNetWorth: GetNetWorthUseCase,
    private val getInvestments: GetInvestmentsReportUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReportsUiState())
    val uiState: StateFlow<ReportsUiState> = _uiState.asStateFlow()

    private var loadJob: Job? = null

    init {
        load()
    }

    fun selectTab(tab: ReportTab) {
        if (tab == _uiState.value.tab) return
        _uiState.update { it.copy(tab = tab, error = null) }
        load()
    }

    fun setPeriod(period: ReportPeriod) {
        _uiState.update { it.copy(period = period) }
        load()
    }

    fun setMonths(months: Int) {
        _uiState.update { it.copy(months = months) }
        load()
    }

    fun retry() = load()

    private fun load() {
        // Trocar de aba/período rapidamente não pode deixar uma resposta antiga sobrescrever a nova.
        loadJob?.cancel()
        val state = _uiState.value
        loadJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val result = when (state.tab) {
                ReportTab.EXPENSES_BY_CATEGORY -> getExpensesByCategory(state.period).onSuccess { data ->
                    _uiState.update { it.copy(expensesByCategory = data) }
                }
                ReportTab.INCOME_VS_EXPENSES -> getIncomeVsExpenses(state.period).onSuccess { data ->
                    _uiState.update { it.copy(incomeVsExpenses = data) }
                }
                ReportTab.MONTHLY_EVOLUTION -> getMonthlyEvolution(state.months).onSuccess { data ->
                    _uiState.update { it.copy(monthlyEvolution = data) }
                }
                ReportTab.EXPENSES_BY_ACCOUNT -> getExpensesByAccount(state.period).onSuccess { data ->
                    _uiState.update { it.copy(expensesByAccount = data) }
                }
                ReportTab.EXPENSES_BY_CARD -> getExpensesByCard(state.period).onSuccess { data ->
                    _uiState.update { it.copy(expensesByCard = data) }
                }
                ReportTab.CASH_FLOW -> getCashFlow(state.period).onSuccess { data ->
                    _uiState.update { it.copy(cashFlow = data) }
                }
                ReportTab.BUDGET_HISTORY -> getBudgetHistory(state.months).onSuccess { data ->
                    _uiState.update { it.copy(budgetHistory = data) }
                }
                ReportTab.NET_WORTH -> getNetWorth(state.months).onSuccess { data ->
                    _uiState.update { it.copy(netWorth = data) }
                }
                ReportTab.INVESTMENTS -> getInvestments(state.period).onSuccess { data ->
                    _uiState.update { it.copy(investments = data) }
                }
            }
            result.onFailure { error ->
                _uiState.update { it.copy(error = error.toUserMessage()) }
            }
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    companion object {
        fun factory(
            getExpensesByCategory: GetExpensesByCategoryUseCase,
            getIncomeVsExpenses: GetIncomeVsExpensesUseCase,
            getMonthlyEvolution: GetMonthlyEvolutionUseCase,
            getExpensesByAccount: GetExpensesByAccountUseCase,
            getExpensesByCard: GetExpensesByCardUseCase,
            getCashFlow: GetCashFlowUseCase,
            getBudgetHistory: GetBudgetHistoryUseCase,
            getNetWorth: GetNetWorthUseCase,
            getInvestments: GetInvestmentsReportUseCase,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                ReportsViewModel(
                    getExpensesByCategory, getIncomeVsExpenses, getMonthlyEvolution,
                    getExpensesByAccount, getExpensesByCard, getCashFlow,
                    getBudgetHistory, getNetWorth, getInvestments,
                )
            }
        }
    }
}
