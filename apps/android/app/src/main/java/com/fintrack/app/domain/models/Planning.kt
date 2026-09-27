package com.fintrack.app.domain.models

enum class BudgetStatus(val wire: String, val label: String) {
    OK("ok", "Dentro do limite"),
    WARNING("warning", "Atenção"),
    EXCEEDED("exceeded", "Estourado");

    companion object {
        fun fromWire(value: String): BudgetStatus = entries.firstOrNull { it.wire == value } ?: OK
    }
}

/** Orçamento de uma categoria no mês. Gasto, restante e percentual são calculados pelo servidor. */
data class Budget(
    val id: String,
    val categoryId: String,
    val categoryName: String,
    val limitCents: Long,
    val spentCents: Long,
    /** Pendente/previsto no mês: ainda não conta como gasto. */
    val pendingCents: Long,
    val remainingCents: Long,
    val percentUsed: Int,
    val status: BudgetStatus,
)

data class BudgetSummary(
    /** AAAA-MM */
    val month: String,
    val items: List<Budget>,
    val limitCents: Long,
    val spentCents: Long,
    val remainingCents: Long,
    val unbudgetedSpentCents: Long,
)

/** Ocorrência prevista de uma recorrência: previsão, ainda sem lançamento (não mexe em saldo). */
data class Occurrence(
    val recurringId: String,
    val name: String,
    val type: TransactionType,
    /** AAAA-MM-DD */
    val date: String,
    val amountCents: Long,
    val estimated: Boolean,
    val accountId: String,
    val overdue: Boolean,
) {
    /** Chave estável na lista (uma recorrência tem no máximo uma ocorrência por data). */
    val key: String get() = "$recurringId|$date"
}
