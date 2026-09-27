package com.fintrack.app.testing

import com.fintrack.app.domain.models.ImportChoice
import com.fintrack.app.domain.models.ImportResult
import com.fintrack.app.domain.models.ImportReview
import com.fintrack.app.domain.models.ImportRow
import com.fintrack.app.domain.models.ImportRowType
import com.fintrack.app.domain.models.PayableInvoice
import com.fintrack.app.domain.repositories.ImportsRepository

fun importRow(
    id: String = "row-1",
    rowNumber: Int = 2,
    description: String = "TELEFONICA BRAS",
    amount: Long = 9_099,
    incoming: Boolean = false,
    type: ImportRowType = ImportRowType.EXPENSE,
    categoryId: String? = "cat-1",
    targetAccountId: String? = null,
    invoiceId: String? = null,
    duplicateKind: String? = null,
    defaultImport: Boolean = true,
) = ImportRow(
    id, rowNumber, "2026-09-20", amount, incoming, description, type,
    categoryId, targetAccountId, invoiceId, duplicateKind, defaultImport,
)

class FakeImportsRepository : ImportsRepository {
    var rows: List<ImportRow> = listOf(
        importRow("r1", 2, "TELEFONICA BRAS"),
        importRow("r2", 3, "SALARIO EMPRESA", 500_000, incoming = true, type = ImportRowType.INCOME, categoryId = "cat-2"),
        importRow("r3", 4, "PADARIA DO ZE", 1_250, duplicateKind = "possible", defaultImport = false, categoryId = null),
    )
    var invoices: List<PayableInvoice> = listOf(PayableInvoice("inv-1", "Nubank", "2026-10", 90_000))
    var failure: Throwable? = null

    val created = mutableListOf<Triple<String, String, String>>()
    val confirmed = mutableListOf<Pair<String, Map<String, ImportChoice>>>()
    val cancelled = mutableListOf<String>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun create(accountId: String, filename: String, content: String): ImportReview {
        maybeFail()
        created += Triple(accountId, filename, content)
        return ImportReview("imp-1", accountId, filename, "review", rows, 1, listOf("Linha 9: Valor zero."))
    }

    override suspend fun confirm(importId: String, choices: Map<String, ImportChoice>): ImportResult {
        maybeFail()
        confirmed += importId to choices
        return ImportResult(choices.values.count { it.import }, choices.values.count { !it.import }, 0, 0, 0)
    }

    override suspend fun cancel(importId: String) {
        maybeFail()
        cancelled += importId
    }

    override suspend fun payableInvoices(): List<PayableInvoice> {
        maybeFail()
        return invoices
    }
}
