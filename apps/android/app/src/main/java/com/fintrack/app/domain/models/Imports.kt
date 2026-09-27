package com.fintrack.app.domain.models

enum class ImportRowType(val wire: String, val label: String) {
    INCOME("income", "Receita"),
    EXPENSE("expense", "Despesa"),
    TRANSFER("transfer", "Transferência"),
    CARD_PAYMENT("card_payment", "Pagamento de fatura");

    companion object {
        fun fromWire(value: String): ImportRowType = entries.firstOrNull { it.wire == value } ?: EXPENSE
    }
}

/** Linha do extrato, com a sugestão do servidor (categoria/tipo/conta) e a situação de duplicidade. */
data class ImportRow(
    val id: String,
    val rowNumber: Int,
    val date: String,
    val amountCents: Long,
    /** true = entrada de dinheiro. */
    val incoming: Boolean,
    val description: String,
    val suggestedType: ImportRowType,
    val suggestedCategoryId: String?,
    val suggestedTargetAccountId: String?,
    val suggestedInvoiceId: String?,
    /** "exact" (já importada), "possible" (lançamento parecido) ou null. */
    val duplicateKind: String?,
    val defaultImport: Boolean,
) {
    /** Tipos que fazem sentido para o sentido do dinheiro: receita só entra; despesa e fatura só saem. */
    val allowedTypes: List<ImportRowType>
        get() = if (incoming) {
            listOf(ImportRowType.INCOME, ImportRowType.TRANSFER)
        } else {
            listOf(ImportRowType.EXPENSE, ImportRowType.TRANSFER, ImportRowType.CARD_PAYMENT)
        }
}

data class ImportReview(
    val id: String,
    val accountId: String,
    val filename: String,
    val status: String,
    val rows: List<ImportRow>,
    val ignoredCount: Int,
    val ignoredSample: List<String>,
)

/** Escolha do usuário para uma linha (o servidor valida tudo de novo ao confirmar). */
data class ImportChoice(
    val import: Boolean,
    val type: ImportRowType,
    val categoryId: String?,
    val targetAccountId: String?,
    val invoiceId: String?,
    val saveRule: Boolean = false,
)

data class ImportResult(
    val imported: Int,
    val skipped: Int,
    val transfers: Int,
    val cardPayments: Int,
    val rulesSaved: Int,
)

data class PayableInvoice(
    val id: String,
    val cardName: String,
    /** AAAA-MM */
    val referenceMonth: String,
    val payableCents: Long,
)
