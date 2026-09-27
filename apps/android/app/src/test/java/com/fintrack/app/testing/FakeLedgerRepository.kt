package com.fintrack.app.testing

import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.models.NewTransaction
import com.fintrack.app.domain.models.NewTransfer
import com.fintrack.app.domain.models.Transaction
import com.fintrack.app.domain.models.TransactionFilters
import com.fintrack.app.domain.models.TransactionPage
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.models.TransferInfo
import com.fintrack.app.domain.repositories.LedgerRepository

fun account(
    id: String = "acc-1",
    name: String = "Banco Inter",
    type: AccountType = AccountType.BANK,
    balance: Long = 0,
    archived: Boolean = false,
) = Account(id, name, type, initialBalanceCents = 0, balanceCents = balance, includeInAvailable = true, archived = archived)

fun category(id: String = "cat-1", name: String = "Alimentação", kind: CategoryKind = CategoryKind.EXPENSE) =
    Category(id, name, kind, archived = false)

fun transaction(
    id: String = "tx-1",
    accountId: String = "acc-1",
    type: TransactionType = TransactionType.EXPENSE,
    amount: Long = 1_000,
    date: String = "2026-09-20",
    status: TransactionStatus = TransactionStatus.COMPLETED,
    transfer: TransferInfo? = null,
) = Transaction(id, accountId, null, type, amount, "", date, status, transfer)

class FakeLedgerRepository : LedgerRepository {
    var accounts: List<Account> = listOf(account("acc-1", "Banco Inter"), account("acc-2", "Mercado Pago"))
    var categories: List<Category> = listOf(category(), category("cat-2", "Salário", CategoryKind.INCOME))
    var pages: Map<String?, TransactionPage> = mapOf(null to TransactionPage(emptyList(), null))
    var failure: Throwable? = null

    val createdTransactions = mutableListOf<NewTransaction>()
    val createdTransfers = mutableListOf<NewTransfer>()
    val createdAccounts = mutableListOf<Triple<String, AccountType, Long>>()
    val completed = mutableListOf<Pair<String, String?>>()
    val completedTransfers = mutableListOf<Pair<String, String?>>()
    val cancelled = mutableListOf<String>()
    val cancelledTransfers = mutableListOf<String>()
    val requestedCursors = mutableListOf<String?>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun accounts(includeArchived: Boolean): List<Account> {
        maybeFail()
        return accounts
    }

    override suspend fun createAccount(name: String, type: AccountType, initialBalanceCents: Long): Account {
        maybeFail()
        createdAccounts += Triple(name, type, initialBalanceCents)
        return account(id = "new", name = name, type = type, balance = initialBalanceCents)
    }

    override suspend fun categories(): List<Category> {
        maybeFail()
        return categories
    }

    override suspend fun transactions(filters: TransactionFilters, cursor: String?): TransactionPage {
        maybeFail()
        requestedCursors += cursor
        return pages[cursor] ?: TransactionPage(emptyList(), null)
    }

    override suspend fun createTransaction(input: NewTransaction) {
        maybeFail()
        createdTransactions += input
    }

    override suspend fun completeTransaction(id: String, date: String?) {
        maybeFail()
        completed += id to date
    }

    override suspend fun cancelTransaction(id: String) {
        maybeFail()
        cancelled += id
    }

    override suspend fun createTransfer(input: NewTransfer) {
        maybeFail()
        createdTransfers += input
    }

    override suspend fun completeTransfer(id: String, date: String?) {
        maybeFail()
        completedTransfers += id to date
    }

    override suspend fun cancelTransfer(id: String) {
        maybeFail()
        cancelledTransfers += id
    }
}
