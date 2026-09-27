package com.fintrack.app.presentation.budgets

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.centsToInput
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Budget
import com.fintrack.app.domain.models.BudgetSummary
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.GetBudgetsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.SaveBudgetUseCase
import java.time.YearMonth
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class BudgetFormState(
    /** Presente ao editar um orçamento existente (a categoria não muda). */
    val editing: Budget? = null,
    val categoryId: String? = null,
    val limit: String = "",
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class BudgetsUiState(
    /** AAAA-MM */
    val month: String,
    val isLoading: Boolean = true,
    val summary: BudgetSummary? = null,
    /** Categorias de despesa ainda sem orçamento no mês (opções do formulário). */
    val availableCategories: List<Category> = emptyList(),
    val error: String? = null,
    val form: BudgetFormState? = null,
)

class BudgetsViewModel(
    private val getBudgets: GetBudgetsUseCase,
    private val saveBudget: SaveBudgetUseCase,
    private val listCategories: ListCategoriesUseCase,
    today: () -> String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BudgetsUiState(month = today().take(7)))
    val uiState: StateFlow<BudgetsUiState> = _uiState.asStateFlow()

    private var expenseCategories: List<Category> = emptyList()
    private var loadJob: Job? = null

    init {
        refresh()
    }

    fun previousMonth() = changeMonth(-1)

    fun nextMonth() = changeMonth(1)

    private fun changeMonth(delta: Long) {
        _uiState.update { it.copy(month = YearMonth.parse(it.month).plusMonths(delta).toString(), summary = null) }
        refresh()
    }

    fun refresh() {
        // Trocar de mês rapidamente não pode deixar uma resposta antiga sobrescrever a nova.
        loadJob?.cancel()
        val month = _uiState.value.month
        loadJob = viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            if (expenseCategories.isEmpty()) {
                listCategories().onSuccess { all ->
                    expenseCategories = all.filter { it.kind == CategoryKind.EXPENSE && !it.archived }
                }
            }
            getBudgets(month).fold(
                onSuccess = { summary ->
                    _uiState.update {
                        it.copy(
                            isLoading = false,
                            summary = summary,
                            availableCategories = withoutBudget(summary),
                        )
                    }
                },
                onFailure = { error -> _uiState.update { it.copy(isLoading = false, error = error.toUserMessage()) } },
            )
        }
    }

    private fun withoutBudget(summary: BudgetSummary): List<Category> {
        val budgeted = summary.items.map { it.categoryId }.toSet()
        return expenseCategories.filter { it.id !in budgeted }
    }

    fun openForm(budget: Budget? = null) = _uiState.update {
        it.copy(
            form = BudgetFormState(
                editing = budget,
                categoryId = budget?.categoryId,
                limit = budget?.let { item -> centsToInput(item.limitCents) }.orEmpty(),
            ),
        )
    }

    fun closeForm() = _uiState.update { it.copy(form = null) }

    fun onFormChange(transform: (BudgetFormState) -> BudgetFormState) = _uiState.update { state ->
        state.form?.let { state.copy(form = transform(it).copy(errors = emptyMap(), formError = null)) } ?: state
    }

    fun submit() {
        val form = _uiState.value.form ?: return
        if (form.submitting) return
        val month = _uiState.value.month
        _uiState.update { it.copy(form = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            saveBudget(form.categoryId, month, form.limit).fold(
                onSuccess = {
                    _uiState.update { it.copy(form = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        val current = state.form ?: return@update state
                        state.copy(
                            form = if (error is FormValidationException) {
                                current.copy(submitting = false, errors = error.errors)
                            } else {
                                current.copy(submitting = false, formError = error.toUserMessage())
                            },
                        )
                    }
                },
            )
        }
    }

    companion object {
        fun factory(
            getBudgets: GetBudgetsUseCase,
            saveBudget: SaveBudgetUseCase,
            listCategories: ListCategoriesUseCase,
            today: () -> String,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer { BudgetsViewModel(getBudgets, saveBudget, listCategories, today) }
        }
    }
}
