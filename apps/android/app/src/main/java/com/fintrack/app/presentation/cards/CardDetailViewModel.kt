package com.fintrack.app.presentation.cards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.fintrack.app.core.utils.centsToInput
import com.fintrack.app.core.utils.toUserMessage
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.models.CreditCard
import com.fintrack.app.domain.models.InvoiceDetail
import com.fintrack.app.domain.models.InvoiceSummary
import com.fintrack.app.domain.models.Purchase
import com.fintrack.app.domain.usecases.CancelPurchaseUseCase
import com.fintrack.app.domain.usecases.CreatePurchaseUseCase
import com.fintrack.app.domain.usecases.FormValidationException
import com.fintrack.app.domain.usecases.GetCardUseCase
import com.fintrack.app.domain.usecases.GetInvoiceUseCase
import com.fintrack.app.domain.usecases.ListAccountsUseCase
import com.fintrack.app.domain.usecases.ListCategoriesUseCase
import com.fintrack.app.domain.usecases.ListInvoicesUseCase
import com.fintrack.app.domain.usecases.ListPurchasesUseCase
import com.fintrack.app.domain.usecases.PayInvoiceUseCase
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class PurchaseFormState(
    val description: String = "",
    val amount: String = "",
    val installments: String = "1",
    val date: String,
    val categoryId: String? = null,
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class PayFormState(
    val invoice: InvoiceDetail,
    val accountId: String?,
    val amount: String,
    val date: String,
    val errors: Map<String, String> = emptyMap(),
    val formError: String? = null,
    val submitting: Boolean = false,
)

data class CardDetailUiState(
    val isLoading: Boolean = true,
    val card: CreditCard? = null,
    val invoices: List<InvoiceSummary> = emptyList(),
    val purchases: List<Purchase> = emptyList(),
    val paymentAccounts: List<Account> = emptyList(),
    val expenseCategories: List<Category> = emptyList(),
    val error: String? = null,
    val expandedInvoiceId: String? = null,
    val expandedDetail: InvoiceDetail? = null,
    val detailError: String? = null,
    val purchaseForm: PurchaseFormState? = null,
    val payForm: PayFormState? = null,
    val cancelling: Purchase? = null,
    val cancelError: String? = null,
)

class CardDetailViewModel(
    private val cardId: String,
    private val getCard: GetCardUseCase,
    private val listInvoices: ListInvoicesUseCase,
    private val getInvoice: GetInvoiceUseCase,
    private val listPurchases: ListPurchasesUseCase,
    private val createPurchase: CreatePurchaseUseCase,
    private val cancelPurchase: CancelPurchaseUseCase,
    private val payInvoice: PayInvoiceUseCase,
    private val listAccounts: ListAccountsUseCase,
    private val listCategories: ListCategoriesUseCase,
    private val today: () -> String,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CardDetailUiState())
    val uiState: StateFlow<CardDetailUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            listAccounts().onSuccess { accounts ->
                _uiState.update { it.copy(paymentAccounts = accounts.filter { a -> a.type != AccountType.INVESTMENT }) }
            }
            listCategories().onSuccess { categories ->
                _uiState.update {
                    it.copy(expenseCategories = categories.filter { c -> c.kind == CategoryKind.EXPENSE && !c.archived })
                }
            }
            val card = getCard(cardId)
            val invoices = listInvoices(cardId)
            val purchases = listPurchases(cardId)
            val failure = card.exceptionOrNull() ?: invoices.exceptionOrNull() ?: purchases.exceptionOrNull()
            if (failure != null) {
                _uiState.update { it.copy(isLoading = false, error = failure.toUserMessage()) }
                return@launch
            }
            _uiState.update {
                it.copy(
                    isLoading = false,
                    card = card.getOrNull(),
                    invoices = invoices.getOrDefault(emptyList()),
                    purchases = purchases.getOrDefault(emptyList()),
                )
            }
            // Mantém a fatura expandida atualizada (ex.: depois de pagar).
            _uiState.value.expandedInvoiceId?.let { loadDetail(it) }
        }
    }

    // ---------- Fatura expandida ----------

    fun toggleInvoice(invoiceId: String) {
        if (_uiState.value.expandedInvoiceId == invoiceId) {
            _uiState.update { it.copy(expandedInvoiceId = null, expandedDetail = null, detailError = null) }
            return
        }
        _uiState.update { it.copy(expandedInvoiceId = invoiceId, expandedDetail = null, detailError = null) }
        viewModelScope.launch { loadDetail(invoiceId) }
    }

    private suspend fun loadDetail(invoiceId: String) {
        getInvoice(invoiceId).fold(
            onSuccess = { detail ->
                _uiState.update { if (it.expandedInvoiceId == invoiceId) it.copy(expandedDetail = detail) else it }
            },
            onFailure = { error -> _uiState.update { it.copy(detailError = error.toUserMessage()) } },
        )
    }

    // ---------- Nova compra ----------

    fun openPurchaseForm() = _uiState.update { it.copy(purchaseForm = PurchaseFormState(date = today())) }

    fun closePurchaseForm() = _uiState.update { it.copy(purchaseForm = null) }

    fun onPurchaseChange(transform: (PurchaseFormState) -> PurchaseFormState) = _uiState.update { state ->
        state.purchaseForm?.let {
            state.copy(purchaseForm = transform(it).copy(errors = emptyMap(), formError = null))
        } ?: state
    }

    fun submitPurchase() {
        val form = _uiState.value.purchaseForm ?: return
        if (form.submitting) return
        _uiState.update { it.copy(purchaseForm = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            createPurchase(cardId, form.description, form.amount, form.installments, form.date, form.categoryId, today())
                .fold(
                    onSuccess = {
                        _uiState.update { it.copy(purchaseForm = null) }
                        refresh()
                    },
                    onFailure = { error ->
                        _uiState.update { state ->
                            val current = state.purchaseForm ?: return@update state
                            state.copy(
                                purchaseForm = if (error is FormValidationException) {
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

    // ---------- Pagar fatura ----------

    /** O valor sugerido é o que resta pagar; a conta sugerida é a do cartão (ou a primeira disponível). */
    fun openPay(invoice: InvoiceDetail) {
        val state = _uiState.value
        val defaultAccount = state.card?.paymentAccountId ?: state.paymentAccounts.firstOrNull()?.id
        _uiState.update {
            it.copy(
                payForm = PayFormState(
                    invoice = invoice,
                    accountId = defaultAccount,
                    amount = centsToInput(invoice.summary.payableCents),
                    date = today(),
                ),
            )
        }
    }

    fun closePay() = _uiState.update { it.copy(payForm = null) }

    fun onPayChange(transform: (PayFormState) -> PayFormState) = _uiState.update { state ->
        state.payForm?.let { state.copy(payForm = transform(it).copy(errors = emptyMap(), formError = null)) } ?: state
    }

    fun submitPay() {
        val form = _uiState.value.payForm ?: return
        if (form.submitting) return
        _uiState.update { it.copy(payForm = form.copy(submitting = true, formError = null)) }
        viewModelScope.launch {
            payInvoice(form.invoice.summary.id, form.accountId, form.amount, form.date).fold(
                onSuccess = {
                    _uiState.update { it.copy(payForm = null) }
                    refresh()
                },
                onFailure = { error ->
                    _uiState.update { state ->
                        val current = state.payForm ?: return@update state
                        state.copy(
                            payForm = if (error is FormValidationException) {
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

    // ---------- Cancelar compra ----------

    fun askCancel(purchase: Purchase) = _uiState.update { it.copy(cancelling = purchase, cancelError = null) }

    fun dismissCancel() = _uiState.update { it.copy(cancelling = null, cancelError = null) }

    fun confirmCancel() {
        val purchase = _uiState.value.cancelling ?: return
        viewModelScope.launch {
            cancelPurchase(purchase).fold(
                onSuccess = {
                    _uiState.update { it.copy(cancelling = null) }
                    refresh()
                },
                onFailure = { error -> _uiState.update { it.copy(cancelError = error.toUserMessage()) } },
            )
        }
    }

    companion object {
        fun factory(
            cardId: String,
            getCard: GetCardUseCase,
            listInvoices: ListInvoicesUseCase,
            getInvoice: GetInvoiceUseCase,
            listPurchases: ListPurchasesUseCase,
            createPurchase: CreatePurchaseUseCase,
            cancelPurchase: CancelPurchaseUseCase,
            payInvoice: PayInvoiceUseCase,
            listAccounts: ListAccountsUseCase,
            listCategories: ListCategoriesUseCase,
            today: () -> String,
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                CardDetailViewModel(
                    cardId, getCard, listInvoices, getInvoice, listPurchases, createPurchase,
                    cancelPurchase, payInvoice, listAccounts, listCategories, today,
                )
            }
        }
    }
}
