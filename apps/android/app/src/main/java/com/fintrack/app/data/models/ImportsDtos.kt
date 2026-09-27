package com.fintrack.app.data.models

import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.ImportRow
import com.fintrack.app.domain.models.ImportRowType
import com.fintrack.app.domain.models.PayableInvoice
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive

/** Espelhos de packages/shared/src/contracts/imports.ts (só o que o app usa). */
@Serializable
data class DuplicateDto(val kind: String, val transactionId: String? = null)

@Serializable
data class ImportRowDto(
    val id: String,
    val rowNumber: Int,
    val date: String,
    val amountCents: Long,
    val direction: String,
    val description: String,
    val suggestedType: String,
    val suggestedCategoryId: String? = null,
    val suggestedTargetAccountId: String? = null,
    val suggestedInvoiceId: String? = null,
    val duplicate: DuplicateDto? = null,
    val defaultAction: String,
)

@Serializable
data class IgnoredRowDto(val line: Int, val reason: String)

@Serializable
data class ImportDetailDto(
    val id: String,
    val accountId: String,
    val filename: String,
    val status: String,
    val rows: List<ImportRowDto>,
    val ignoredRowsCount: Int = 0,
    val ignoredRows: List<IgnoredRowDto> = emptyList(),
)

@Serializable
data class CreateImportRequestDto(val accountId: String, val filename: String, val content: String)

/**
 * Decisão por linha. `categoryId` é JsonElement para poder enviar `null` EXPLÍCITO (= "sem categoria"),
 * diferente de ausente (= usar a sugestão do servidor).
 */
@Serializable
data class DecisionDto(
    val rowId: String,
    val action: String,
    val type: String? = null,
    val categoryId: JsonElement? = null,
    val targetAccountId: String? = null,
    val invoiceId: String? = null,
    val saveRule: Boolean? = null,
)

@Serializable
data class ConfirmImportRequestDto(val decisions: List<DecisionDto>)

@Serializable
data class ConfirmImportResponseDto(
    val imported: Int,
    val skipped: Int,
    val transfers: Int,
    val cardPayments: Int,
    val rulesSaved: Int,
)

@Serializable
data class PayableInvoiceDto(
    val id: String,
    val cardName: String,
    val referenceMonth: String,
    val payableCents: Long,
)

@Serializable
data class PayableInvoiceListDto(val items: List<PayableInvoiceDto>)

fun ImportRowDto.toDomain() = ImportRow(
    id = id,
    rowNumber = rowNumber,
    date = date,
    amountCents = amountCents,
    incoming = direction == "in",
    description = description,
    suggestedType = ImportRowType.fromWire(suggestedType),
    suggestedCategoryId = suggestedCategoryId,
    suggestedTargetAccountId = suggestedTargetAccountId,
    suggestedInvoiceId = suggestedInvoiceId,
    duplicateKind = duplicate?.kind,
    defaultImport = defaultAction == "import",
)

fun ImportDetailDto.toDomain() = ImportReview(
    id = id,
    accountId = accountId,
    filename = filename,
    status = status,
    rows = rows.map { it.toDomain() },
    ignoredCount = ignoredRowsCount,
    ignoredSample = ignoredRows.map { "Linha ${it.line}: ${it.reason}" },
)

fun ConfirmImportResponseDto.toDomain() = ImportResult(imported, skipped, transfers, cardPayments, rulesSaved)

fun PayableInvoiceDto.toDomain() = PayableInvoice(id, cardName, referenceMonth, payableCents)

/** Converte a escolha em decisão da API (categoria só para receita/despesa; null explícito = sem categoria). */
fun ImportChoice.toDto(rowId: String): DecisionDto {
    if (!import) return DecisionDto(rowId = rowId, action = "skip")
    val hasCategory = type == ImportRowType.INCOME || type == ImportRowType.EXPENSE
    return DecisionDto(
        rowId = rowId,
        action = "import",
        type = type.wire,
        categoryId = if (hasCategory) (categoryId?.let { JsonPrimitive(it) } ?: JsonNull) else null,
        targetAccountId = if (type == ImportRowType.TRANSFER) targetAccountId else null,
        invoiceId = if (type == ImportRowType.CARD_PAYMENT) invoiceId else null,
        saveRule = if (saveRule && type != ImportRowType.CARD_PAYMENT) true else null,
    )
}
