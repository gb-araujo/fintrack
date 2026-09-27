package com.fintrack.app.domain.models

enum class AccountType(val wire: String, val label: String) {
    BANK("bank", "Conta bancária"),
    WALLET("wallet", "Carteira"),
    INVESTMENT("investment", "Investimento");

    companion object {
        fun fromWire(value: String): AccountType = entries.firstOrNull { it.wire == value } ?: BANK
    }
}

enum class CategoryKind(val wire: String) {
    INCOME("income"),
    EXPENSE("expense");

    companion object {
        fun fromWire(value: String): CategoryKind = entries.firstOrNull { it.wire == value } ?: EXPENSE
    }
}

enum class TransactionType(val wire: String) {
    INCOME("income"),
    EXPENSE("expense"),
    TRANSFER("transfer"),
    CARD_PAYMENT("card_payment");

    companion object {
        fun fromWire(value: String): TransactionType = entries.firstOrNull { it.wire == value } ?: EXPENSE
    }
}

enum class TransactionStatus(val wire: String) {
    PENDING("pending"),
    COMPLETED("completed"),
    CANCELLED("cancelled");

    companion object {
        fun fromWire(value: String): TransactionStatus = entries.firstOrNull { it.wire == value } ?: COMPLETED
    }
}

data class Account(
    val id: String,
    val name: String,
    val type: AccountType,
    val initialBalanceCents: Long,
    /** Calculado pelo backend (saldo inicial + lançamentos efetivados). O app nunca recalcula. */
    val balanceCents: Long,
    val includeInAvailable: Boolean,
    val archived: Boolean,
)

data class Category(
    val id: String,
    val name: String,
    val kind: CategoryKind,
    val archived: Boolean,
)

data class TransferInfo(
    val id: String,
    val isOutgoing: Boolean,
    val fromAccountId: String,
    val toAccountId: String,
)

data class Transaction(
    val id: String,
    val accountId: String,
    val categoryId: String?,
    val type: TransactionType,
    val amountCents: Long,
    val description: String,
    /** AAAA-MM-DD */
    val date: String,
    val status: TransactionStatus,
    val transfer: TransferInfo?,
) {
    /** Valor com sinal do ponto de vista da conta (apenas apresentação). */
    val signedAmountCents: Long
        get() {
            val positive = type == TransactionType.INCOME || (transfer != null && !transfer.isOutgoing)
            return if (positive) amountCents else -amountCents
        }
}

data class TransactionPage(val items: List<Transaction>, val nextCursor: String?)

data class TransactionFilters(
    val accountId: String? = null,
    val type: TransactionType? = null,
    val status: TransactionStatus? = null,
)

data class NewTransaction(
    val accountId: String,
    val type: TransactionType,
    val categoryId: String?,
    val amountCents: Long,
    val description: String,
    val date: String,
    val pending: Boolean,
)

data class NewTransfer(
    val fromAccountId: String,
    val toAccountId: String,
    val amountCents: Long,
    val date: String,
    val description: String,
    val pending: Boolean,
)
