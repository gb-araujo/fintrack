package com.fintrack.app.data.repositories

import com.fintrack.app.core.network.apiCall
import com.fintrack.app.data.api.LedgerApi
import com.fintrack.app.data.models.CompleteRequestDto
import com.fintrack.app.data.models.CreateAccountRequestDto
import com.fintrack.app.data.models.CreateTransactionRequestDto
import com.fintrack.app.data.models.CreateTransferRequestDto
import com.fintrack.app.data.models.toDomain
import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.NewTransaction
import com.fintrack.app.domain.models.NewTransfer
import com.fintrack.app.domain.models.TransactionFilters
import com.fintrack.app.domain.models.TransactionPage
import com.fintrack.app.domain.repositories.LedgerRepository
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class LedgerRepositoryImpl(
    private val api: LedgerApi,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
) : LedgerRepository {

    override suspend fun accounts(includeArchived: Boolean): List<Account> = withContext(ioDispatcher) {
        apiCall { api.accounts(includeArchived) }.items.map { it.toDomain() }
    }

    override suspend fun createAccount(name: String, type: AccountType, initialBalanceCents: Long): Account =
        withContext(ioDispatcher) {
            apiCall {
                api.createAccount(
                    CreateAccountRequestDto(
                        name = name,
                        type = type.wire,
                        initialBalanceCents = initialBalanceCents,
                        // Investimentos ficam fora do "dinheiro disponível" por padrão (mesma regra da API/Web).
                        includeInAvailable = type != AccountType.INVESTMENT,
                    ),
                )
            }.toDomain()
        }

    override suspend fun categories(): List<Category> = withContext(ioDispatcher) {
        apiCall { api.categories() }.items.map { it.toDomain() }
    }

    override suspend fun transactions(filters: TransactionFilters, cursor: String?): TransactionPage =
        withContext(ioDispatcher) {
            apiCall {
                api.transactions(
                    limit = PAGE_SIZE,
                    cursor = cursor,
                    accountId = filters.accountId,
                    type = filters.type?.wire,
                    status = filters.status?.wire,
                )
            }.toDomain()
        }

    override suspend fun createTransaction(input: NewTransaction) {
        withContext(ioDispatcher) {
            apiCall {
                api.createTransaction(
                    CreateTransactionRequestDto(
                        accountId = input.accountId,
                        type = input.type.wire,
                        categoryId = input.categoryId,
                        amountCents = input.amountCents,
                        description = input.description,
                        transactionDate = input.date,
                        status = if (input.pending) "pending" else null,
                    ),
                )
            }
        }
    }

    override suspend fun completeTransaction(id: String, date: String?) {
        withContext(ioDispatcher) { apiCall { api.completeTransaction(id, CompleteRequestDto(date)) } }
    }

    override suspend fun cancelTransaction(id: String) {
        withContext(ioDispatcher) { apiCall { api.cancelTransaction(id) } }
    }

    override suspend fun createTransfer(input: NewTransfer) {
        withContext(ioDispatcher) {
            apiCall {
                api.createTransfer(
                    CreateTransferRequestDto(
                        fromAccountId = input.fromAccountId,
                        toAccountId = input.toAccountId,
                        amountCents = input.amountCents,
                        transferDate = input.date,
                        description = input.description,
                        status = if (input.pending) "pending" else null,
                    ),
                )
            }
        }
    }

    override suspend fun completeTransfer(id: String, date: String?) {
        withContext(ioDispatcher) { apiCall { api.completeTransfer(id, CompleteRequestDto(date)) } }
    }

    override suspend fun cancelTransfer(id: String) {
        withContext(ioDispatcher) { apiCall { api.cancelTransfer(id) } }
    }

    private companion object {
        const val PAGE_SIZE = 30
    }
}
