package com.fintrack.app.data.models

import com.fintrack.app.domain.models.Account
import com.fintrack.app.domain.models.AccountType
import com.fintrack.app.domain.models.Category
import com.fintrack.app.domain.models.CategoryKind
import com.fintrack.app.domain.models.Transaction
import com.fintrack.app.domain.models.TransactionPage
import com.fintrack.app.domain.models.TransactionStatus
import com.fintrack.app.domain.models.TransactionType
import com.fintrack.app.domain.models.TransferInfo
import kotlinx.serialization.Serializable

/** Espelhos de packages/shared/src/contracts (accounts, categories, transactions, transfers). */
@Serializable
data class AccountDto(
    val id: String,
    val name: String,
    val type: String,
    val initialBalanceCents: Long,
    val balanceCents: Long,
    val includeInAvailable: Boolean,
    val archivedAt: String? = null,
)

@Serializable
data class AccountListDto(val items: List<AccountDto>)

@Serializable
data class CreateAccountRequestDto(
    val name: String,
    val type: String,
    val initialBalanceCents: Long,
    val includeInAvailable: Boolean,
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val kind: String,
    val archivedAt: String? = null,
)

@Serializable
data class CategoryListDto(val items: List<CategoryDto>)

@Serializable
data class TransferInfoDto(
    val id: String,
    val direction: String,
    val fromAccountId: String,
    val toAccountId: String,
)

@Serializable
data class TransactionDto(
    val id: String,
    val accountId: String,
    val categoryId: String? = null,
    val type: String,
    val amountCents: Long,
    val description: String,
    val transactionDate: String,
    val status: String,
    val transfer: TransferInfoDto? = null,
)

@Serializable
data class TransactionListDto(val items: List<TransactionDto>, val nextCursor: String? = null)

@Serializable
data class CreateTransactionRequestDto(
    val accountId: String,
    val type: String,
    val categoryId: String? = null,
    val amountCents: Long,
    val description: String,
    val transactionDate: String,
    /** "pending" ou ausente: sem status, a API decide pela data (até hoje = efetivado). */
    val status: String? = null,
)

@Serializable
data class CreateTransferRequestDto(
    val fromAccountId: String,
    val toAccountId: String,
    val amountCents: Long,
    val transferDate: String,
    val description: String,
    val status: String? = null,
)

@Serializable
data class CompleteRequestDto(val transactionDate: String? = null)

/** Resposta de /transfers não é usada pelo app além do sucesso. */
@Serializable
data class TransferDto(val id: String)

fun AccountDto.toDomain() = Account(
    id = id,
    name = name,
    type = AccountType.fromWire(type),
    initialBalanceCents = initialBalanceCents,
    balanceCents = balanceCents,
    includeInAvailable = includeInAvailable,
    archived = archivedAt != null,
)

fun CategoryDto.toDomain() = Category(
    id = id,
    name = name,
    kind = CategoryKind.fromWire(kind),
    archived = archivedAt != null,
)

fun TransactionDto.toDomain() = Transaction(
    id = id,
    accountId = accountId,
    categoryId = categoryId,
    type = TransactionType.fromWire(type),
    amountCents = amountCents,
    description = description,
    date = transactionDate,
    status = TransactionStatus.fromWire(status),
    transfer = transfer?.let {
        TransferInfo(
            id = it.id,
            isOutgoing = it.direction == "out",
            fromAccountId = it.fromAccountId,
            toAccountId = it.toAccountId,
        )
    },
)

fun TransactionListDto.toDomain() = TransactionPage(items.map { it.toDomain() }, nextCursor)
