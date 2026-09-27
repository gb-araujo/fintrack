package com.fintrack.app.presentation.imports

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.ImportRow
import com.fintrack.app.domain.models.PayableInvoice
import com.fintrack.app.domain.usecases.CancelImportUseCase
import com.fintrack.app.domain.usecases.ConfirmImportUseCase
import com.fintrack.app.domain.usecases.CreateImportUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListPayableInvoicesUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ImportUiState(
    val accounts: List<Account> = emptyList(),
    val categories: List<Category> = emptyList(),
    val payableInvoices: List<PayableInvoice> = emptyList(),
    val selectedAccountId: String? = null,
    val uploading: Boolean = false,
    val error: String? = null,
    val review: ImportReview? = null,
    val choices: Map<String, ImportChoice> = emptyMap(),
    val rowErrors: Map<String, String> = emptyMap(),
    val confirming: Boolean = false,
    val result: ImportResult? = null,
) {
    val selectedCount: Int get() = choices.values.count { it.import }
}

class ImportViewModel(
    private val listAccounts: ListAccountsUseCase,
    private val listCategories: ListCategoriesUseCase,
    private val listPayableInvoices: ListPayableInvoicesUseCase,
    private val createImport: CreateImportUseCase,
    private val confirmImport: ConfirmImportUseCase,
    private val cancelImport: CancelImportUseCase,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ImportUiState())
    val uiState: StateFlow<ImportUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            listAccounts().onSuccess { accounts ->
                val usable = accounts.filter { it.type != AccountType.INVESTMENT }
                _uiState.update { it.copy(accounts = usable, selectedAccountId = it.selectedAccountId ?: usable.firstOrNull()?.id) }
            }
            listCategories().onSuccess { categories ->
                _uiState.update { it.copy(categories = categories.filter { c -> !c.archived }) }
            }
        }
    }

    fun selectAccount(accountId: String) = _uiState.update { it.copy(selectedAccountId = accountId, error = null) }

    /** Envia o conteúdo lido do arquivo. Nada vira lançamento: o servidor devolve a revisão. */
    fun upload(filename: String, content: String) {
        if (_uiState.value.uploading) return
        _uiState.update { it.copy(uploading = true, error = null) }
        viewModelScope.launch {
            createImport(_uiState.value.selectedAccountId, filename, content).fold(
                onSuccess = { review ->
                    val invoices = listPayableInvoices().getOrDefault(emptyList())
                    _uiState.update {
                        it.copy(
                            uploading = false,
                            review = review,
                            payableInvoices = invoices,
                            choices = review.rows.associate { row -> row.id to initialChoice(row) },
                            rowErrors = emptyMap(),
                        )
                    }
                },
                onFailure = { error ->
                    val message = if (error is FormValidationException) error.errors.values.joinToString(" ") else error.toUserMessage()
                    _uiState.update { it.copy(uploading = false, error = message) }
                },
            )
        }
    }

    fun onChoice(rowId: String, transform: (ImportChoice) -> ImportChoice) = _uiState.update { state ->
        val current = state.choices[rowId] ?: return@update state
        state.copy(
            choices = state.choices + (rowId to transform(current)),
            rowErrors = state.rowErrors - rowId,
            error = null,
        )
    }

    fun confirm() {
        val state = _uiState.value
        val review = state.review ?: return
        if (state.confirming) return
        _uiState.update { it.copy(confirming = true, error = null, rowErrors = emptyMap()) }
        viewModelScope.launch {
            confirmImport(review, state.choices).fold(
                onSuccess = { result -> _uiState.update { it.copy(confirming = false, result = result) } },
                onFailure = { error ->
                    _uiState.update {
                        if (error is FormValidationException) {
                            it.copy(confirming = false, rowErrors = error.errors)
                        } else {
                            it.copy(confirming = false, error = error.toUserMessage())
                        }
                    }
                },
            )
        }
    }

    /** Descarta a revisão (nada foi criado). */
    fun discard() {
        val review = _uiState.value.review ?: return
        viewModelScope.launch {
            cancelImport(review.id)
            _uiState.update { it.copy(review = null, choices = emptyMap(), rowErrors = emptyMap(), error = null) }
        }
    }

    fun reset() = _uiState.update {
        it.copy(review = null, choices = emptyMap(), rowErrors = emptyMap(), result = null, error = null, uploading = false)
    }

    private fun initialChoice(row: ImportRow) = ImportChoice(
        import = row.defaultImport,
        type = row.suggestedType,
        categoryId = row.suggestedCategoryId,
        targetAccountId = row.suggestedTargetAccountId,
        invoiceId = row.suggestedInvoiceId,
    )

    companion object {
        fun factory(
            listAccounts: ListAccountsUseCase,
            listCategories: ListCategoriesUseCase,
            listPayableInvoices: ListPayableInvoicesUseCase,
            createImport: CreateImportUseCase,
            confirmImport: ConfirmImportUseCase,
            cancelImport: CancelImportUseCase,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                ImportViewModel(listAccounts, listCategories, listPayableInvoices, createImport, confirmImport, cancelImport)
            }
        }
    }
}
