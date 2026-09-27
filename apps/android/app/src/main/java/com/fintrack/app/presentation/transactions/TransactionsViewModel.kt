package com.fintrack.app.presentation.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.Transaction
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.usecases.CancelEntryUseCase
import com.fintrack.app.domain.usecases.CompleteEntryUseCase
import com.fintrack.app.domain.usecases.CreateTransactionUseCase
import com.fintrack.app.domain.usecases.CreateTransferUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListTransactionsUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class EntryKind { INCOME, EXPENSE, TRANSFER }

data class EntryFormState(
    val kind: EntryKind,
    val accountId: String = "",
    val toAccountId: String = "",
    val categoryId: String = "",
    val amount: String = "",
    val description: String = "",
    val date: String,
    val pending: Boolean = false,
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

sealed interface TransactionsDialog {
    data class Entry(val form: EntryFormState) : TransactionsDialog
    data class ConfirmCancel(val transaction: Transaction, val error: String? = null) : TransactionsDialog
    data class CompleteDate(val transaction: Transaction, val date: String, val error: String? = null) : TransactionsDialog
}

data class TransactionsUiState(
    val isLoading: Boolean = true,
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val items: List<Transaction> = emptyList(),
    val nextCursor: String? = null,
    val isLoadingMore: Boolean = false,
    val error: String? = null,
    val actionError: String? = null,
    val dialog: TransactionsDialog? = null,
) {
    val accountsById: Map<String, Account> get() = accounts.associateBy { it.id }
    val categoriesById: Map<String, Category> get() = categories.associateBy { it.id }
}

class TransactionsViewModel(
    private val listAccounts: ListAccountsUseCase,
    private val listCategories: ListCategoriesUseCase,
    private val listTransactions: ListTransactionsUseCase,
    private val createTransaction: CreateTransactionUseCase,
    private val createTransfer: CreateTransferUseCase,
    private val completeEntry: CompleteEntryUseCase,
    private val cancelEntry: CancelEntryUseCase,
    /** "Hoje" (AAAA-MM-DD) no fuso do usuário — só para valores padrão e para decidir se pede a data. */
    private val today: () -> String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(TransactionsUiState())
    val uiState: StateFlow<TransactionsUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null, actionError = null) }
            val accounts = listAccounts(includeArchived = true)
            val categories = listCategories()
            val page = listTransactions()
            val failure = accounts.exceptionOrNull() ?: categories.exceptionOrNull() ?: page.exceptionOrNull()
            if (failure != null) {
                _uiState.update { it.copy(isLoading = false, error = failure.toUserMessage()) }
                return@launch
            }
            _uiState.update {
                it.copy(
                    isLoading = false,
                    accounts = accounts.getOrThrow(),
                    categories = categories.getOrThrow(),
                    items = page.getOrThrow().items,
                    nextCursor = page.getOrThrow().nextCursor,
                )
            }
        }
    }

    fun loadMore() {
        val cursor = _uiState.value.nextCursor ?: return
        if (_uiState.value.isLoadingMore) return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoadingMore = true) }
            listTransactions(cursor = cursor).fold(
                onSuccess = { page ->
                    _uiState.update {
                        it.copy(isLoadingMore = false, items = it.items + page.items, nextCursor = page.nextCursor)
                    }
                },
                onFailure = { error -> _uiState.update { it.copy(isLoadingMore = false, actionError = error.toUserMessage()) } },
            )
        }
    }

    // ---------- Novo lançamento / transferência ----------

    fun openEntry(kind: EntryKind) {
        val usable = _uiState.value.accounts.filter { !it.archived && (kind == EntryKind.TRANSFER || it.type != AccountType.INVESTMENT) }
        _uiState.update {
            it.copy(
                dialog = TransactionsDialog.Entry(
                    EntryFormState(
                        kind = kind,
                        accountId = usable.firstOrNull()?.id.orEmpty(),
                        toAccountId = if (kind == EntryKind.TRANSFER) usable.getOrNull(1)?.id.orEmpty() else "",
                        date = today(),
                    ),
                ),
            )
        }
    }

    fun onEntryChange(transform: (EntryFormState) -> EntryFormState) = _uiState.update { state ->
        val dialog = state.dialog as? TransactionsDialog.Entry ?: return@update state
        state.copy(dialog = TransactionsDialog.Entry(transform(dialog.form).copy(errors = emptyMap(), formError = null)))
    }

    fun submitEntry() {
        val dialog = _uiState.value.dialog as? TransactionsDialog.Entry ?: return
        val form = dialog.form
        if (form.submitting) return
        _uiState.update { it.copy(dialog = TransactionsDialog.Entry(form.copy(submitting = true, formError = null))) }
        viewModelScope.launch {
            val result = when (form.kind) {
                EntryKind.TRANSFER -> createTransfer(
                    form.accountId, form.toAccountId, form.amount, form.description, form.date, form.pending,
                )
                else -> createTransaction(
                    form.accountId,
                    if (form.kind == EntryKind.INCOME) TransactionType.INCOME else TransactionType.EXPENSE,
                    form.categoryId,
                    form.amount,
                    form.description,
                    form.date,
                    form.pending,
                )
            }
            result.fold(
                onSuccess = {
                    _uiState.update { it.copy(dialog = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            dialog = TransactionsDialog.Entry(
                                if (error is FormValidationException) {
                                    form.copy(submitting = false, errors = error.errors)
                                } else {
                                    form.copy(submitting = false, formError = error.toUserMessage())
                                },
                            ),
                        )
                    }
                },
            )
        }
    }

    // ---------- Efetivar ----------

    fun requestComplete(transaction: Transaction) {
        // Pendente com vencimento futuro: pergunta a data real (nada é efetivado no futuro).
        if (transaction.date > today()) {
            _uiState.update { it.copy(dialog = TransactionsDialog.CompleteDate(transaction, today())) }
        } else {
            complete(transaction, null)
        }
    }

    fun onCompleteDateChange(date: String) = _uiState.update { state ->
        val dialog = state.dialog as? TransactionsDialog.CompleteDate ?: return@update state
        state.copy(dialog = dialog.copy(date = date, error = null))
    }

    fun confirmCompleteDate() {
        val dialog = _uiState.value.dialog as? TransactionsDialog.CompleteDate ?: return
        complete(dialog.transaction, dialog.date)
    }

    private fun complete(transaction: Transaction, date: String?) {
        viewModelScope.launch {
            completeEntry(transaction, date).fold(
                onSuccess = {
                    _uiState.update { it.copy(dialog = null) }
                    refresh()
                },
                onFailure = { error ->
                    val message = error.toUserMessage()
                    _uiState.update { state ->
                        val dialog = state.dialog
                        if (dialog is TransactionsDialog.CompleteDate) state.copy(dialog = dialog.copy(error = message))
                        else state.copy(actionError = message)
                    }
                },
            )
        }
    }

    // ---------- Cancelar ----------

    fun requestCancel(transaction: Transaction) =
        _uiState.update { it.copy(dialog = TransactionsDialog.ConfirmCancel(transaction), actionError = null) }

    fun confirmCancel() {
        val dialog = _uiState.value.dialog as? TransactionsDialog.ConfirmCancel ?: return
        viewModelScope.launch {
            cancelEntry(dialog.transaction).fold(
                onSuccess = {
                    _uiState.update { it.copy(dialog = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { it.copy(dialog = dialog.copy(error = error.toUserMessage())) }
                },
            )
        }
    }

    fun dismissDialog() = _uiState.update { it.copy(dialog = null) }

    companion object {
        fun factory(
            listAccounts: ListAccountsUseCase,
            listCategories: ListCategoriesUseCase,
            listTransactions: ListTransactionsUseCase,
            createTransaction: CreateTransactionUseCase,
            createTransfer: CreateTransferUseCase,
            completeEntry: CompleteEntryUseCase,
            cancelEntry: CancelEntryUseCase,
            today: () -> String,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                TransactionsViewModel(
                    listAccounts, listCategories, listTransactions, createTransaction, createTransfer,
                    completeEntry, cancelEntry, today,
                )
            }
        }
    }
}
