package com.fintrack.app.domain.repositories

import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.NewTransaction
import com.fintrack.app.domain.models.NewTransfer
import com.fintrack.app.domain.models.TransactionFilters
import com.fintrack.app.domain.models.TransactionPage

interface LedgerRepository {
    suspend fun accounts(includeArchived: Boolean = false): List<Account>

    suspend fun createAccount(name: String, type: AccountType, initialBalanceCents: Long): Account

    suspend fun categories(): List<Category>

    suspend fun transactions(filters: TransactionFilters = TransactionFilters(), cursor: String? = null): TransactionPage

    suspend fun createTransaction(input: NewTransaction)

    suspend fun completeTransaction(id: String, date: String? = null)

    suspend fun cancelTransaction(id: String)

    suspend fun createTransfer(input: NewTransfer)

    suspend fun completeTransfer(id: String, date: String? = null)

    suspend fun cancelTransfer(id: String)
}
