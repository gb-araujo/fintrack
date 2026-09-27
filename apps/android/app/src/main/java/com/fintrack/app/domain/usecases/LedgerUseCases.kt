package com.fintrack.app.domain.usecases

import com.fintrack.app.core.utils.parseMoneyToCents
import com.fintrack.app.core.utils.suspendRunCatching
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.NewTransaction
import com.fintrack.app.domain.models.NewTransfer
import com.fintrack.app.domain.models.Transaction
import com.fintrack.app.domain.models.TransactionFilters
import com.fintrack.app.domain.models.TransactionPage
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.repositories.LedgerRepository
import java.time.LocalDate
import java.time.format.DateTimeParseException

/** Erros de validação por campo (chaves: "name", "amount", "account", "toAccount", "date"). */
class FormValidationException(val errors: Map<String, String>) : Exception("Dados inválidos: ${errors.keys}")

internal fun validDate(text: String): Boolean =
    try {
        LocalDate.parse(text)
        true
    } catch (_: DateTimeParseException) {
        false
    }

/** Valor de uma movimentação: inteiro positivo em centavos. */
internal fun amountError(text: String): Pair<Long?, String?> {
    if (text.isBlank()) return null to "Informe o valor."
    val cents = parseMoneyToCents(text) ?: return null to "Valor inválido. Use o formato 1.234,56."
    if (cents <= 0) return null to "O valor deve ser maior que zero."
    return cents to null
}

class ListAccountsUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(includeArchived: Boolean = false): Result<List<Account>> =
        suspendRunCatching { repository.accounts(includeArchived) }
}

class ListCategoriesUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(): Result<List<Category>> = suspendRunCatching { repository.categories() }
}

class ListTransactionsUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(
        filters: TransactionFilters = TransactionFilters(),
        cursor: String? = null,
    ): Result<TransactionPage> = suspendRunCatching { repository.transactions(filters, cursor) }
}

class CreateAccountUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(name: String, type: AccountType, balanceText: String): Result<Account> =
        suspendRunCatching {
            val errors = mutableMapOf<String, String>()
            if (name.isBlank()) errors["name"] = "Informe o nome da conta."
            else if (name.trim().length > 60) errors["name"] = "Nome muito longo (máximo 60 caracteres)."
            // Saldo inicial vazio vale zero; pode ser negativo (cheque especial).
            val balance = if (balanceText.isBlank()) 0L else parseMoneyToCents(balanceText)
            if (balance == null) errors["balance"] = "Valor inválido. Use o formato 1.234,56."
            if (errors.isNotEmpty()) throw FormValidationException(errors)
            repository.createAccount(name.trim(), type, balance!!)
        }
}

class CreateTransactionUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(
        accountId: String?,
        type: TransactionType,
        categoryId: String?,
        amountText: String,
        description: String,
        date: String,
        pending: Boolean,
    ): Result<Unit> = suspendRunCatching {
        require(type == TransactionType.INCOME || type == TransactionType.EXPENSE) {
            "Transferências usam CreateTransferUseCase"
        }
        val errors = mutableMapOf<String, String>()
        val (cents, amountMessage) = amountError(amountText)
        if (amountMessage != null) errors["amount"] = amountMessage
        if (accountId.isNullOrEmpty()) errors["account"] = "Escolha a conta."
        if (!validDate(date)) errors["date"] = "Informe a data (AAAA-MM-DD)."
        if (description.trim().length > 200) errors["description"] = "Descrição muito longa (máximo 200 caracteres)."
        if (errors.isNotEmpty()) throw FormValidationException(errors)

        repository.createTransaction(
            NewTransaction(
                accountId = accountId!!,
                type = type,
                categoryId = categoryId?.takeIf { it.isNotEmpty() },
                amountCents = cents!!,
                description = description.trim(),
                date = date,
                pending = pending,
            ),
        )
    }
}

class CreateTransferUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(
        fromAccountId: String?,
        toAccountId: String?,
        amountText: String,
        description: String,
        date: String,
        pending: Boolean,
    ): Result<Unit> = suspendRunCatching {
        val errors = mutableMapOf<String, String>()
        val (cents, amountMessage) = amountError(amountText)
        if (amountMessage != null) errors["amount"] = amountMessage
        if (fromAccountId.isNullOrEmpty()) errors["account"] = "Escolha a conta de origem."
        if (toAccountId.isNullOrEmpty()) errors["toAccount"] = "Escolha a conta de destino."
        else if (fromAccountId == toAccountId) errors["toAccount"] = "A conta de origem e a de destino devem ser diferentes."
        if (!validDate(date)) errors["date"] = "Informe a data (AAAA-MM-DD)."
        if (errors.isNotEmpty()) throw FormValidationException(errors)

        repository.createTransfer(
            NewTransfer(
                fromAccountId = fromAccountId!!,
                toAccountId = toAccountId!!,
                amountCents = cents!!,
                date = date,
                description = description.trim(),
                pending = pending,
            ),
        )
    }
}

/** Efetiva um lançamento pendente; pernas de transferência efetivam a transferência inteira. */
class CompleteEntryUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(transaction: Transaction, date: String? = null): Result<Unit> =
        suspendRunCatching {
            val transfer = transaction.transfer
            if (transfer != null) repository.completeTransfer(transfer.id, date)
            else repository.completeTransaction(transaction.id, date)
        }
}

/** Cancela (nunca apaga). Pernas de transferência cancelam a transferência inteira (as duas contas). */
class CancelEntryUseCase(private val repository: LedgerRepository) {
    suspend operator fun invoke(transaction: Transaction): Result<Unit> = suspendRunCatching {
        val transfer = transaction.transfer
        if (transfer != null) repository.cancelTransfer(transfer.id) else repository.cancelTransaction(transaction.id)
    }
}
