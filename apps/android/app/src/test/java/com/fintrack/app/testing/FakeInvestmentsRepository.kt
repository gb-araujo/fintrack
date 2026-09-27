package com.fintrack.app.testing

import com.fintrack.app.domain.models.InvestmentSummary
import com.fintrack.app.domain.models.InvestmentValuation
import com.fintrack.app.domain.repositories.InvestmentsRepository

fun investmentSummary(
    accountId: String = "inv-1",
    accountName: String = "CDB",
    institution: String? = null,
    product: String? = null,
    balanceCents: Long = 150_000,
    netContributedCents: Long = 150_000,
    latestValuationDate: String? = null,
    totalYieldCents: Long? = null,
    totalYieldPercent: Double? = null,
) = InvestmentSummary(
    accountId, accountName, institution, product, balanceCents, netContributedCents,
    latestValuationDate, totalYieldCents, totalYieldPercent,
)

fun investmentValuation(
    id: String = "val-1",
    accountId: String = "inv-1",
    date: String = "2026-09-20",
    balanceCents: Long = 150_000,
    note: String? = null,
    yieldCents: Long? = null,
    yieldPercent: Double? = null,
    contributedCents: Long = 0,
    createdAt: String = "2026-09-20T12:00:00.000Z",
) = InvestmentValuation(id, accountId, date, balanceCents, note, yieldCents, yieldPercent, contributedCents, createdAt)

data class UpsertCall(val accountId: String, val date: String, val balanceCents: Long, val note: String?)

class FakeInvestmentsRepository : InvestmentsRepository {
    var summaries: List<InvestmentSummary> = listOf(investmentSummary())
    val valuationsByAccount: MutableMap<String, MutableList<InvestmentValuation>> = mutableMapOf()
    var failure: Throwable? = null
    private var nextValuationId = 1

    val upserted = mutableListOf<UpsertCall>()
    val deleted = mutableListOf<Pair<String, String>>()
    val detailsUpdated = mutableListOf<Triple<String, String?, String?>>()

    private fun maybeFail() {
        failure?.let { throw it }
    }

    override suspend fun list(): List<InvestmentSummary> {
        maybeFail()
        return summaries
    }

    override suspend fun valuations(accountId: String): List<InvestmentValuation> {
        maybeFail()
        return valuationsByAccount[accountId] ?: emptyList()
    }

    override suspend fun upsertValuation(
        accountId: String,
        date: String,
        balanceCents: Long,
        note: String?,
    ): InvestmentValuation {
        maybeFail()
        upserted += UpsertCall(accountId, date, balanceCents, note)
        val list = valuationsByAccount.getOrPut(accountId) { mutableListOf() }
        val existing = list.find { it.date == date }
        val result = investmentValuation(
            id = existing?.id ?: "val-${nextValuationId++}",
            accountId = accountId,
            date = date,
            balanceCents = balanceCents,
            note = note,
        )
        list.removeAll { it.date == date }
        list += result
        return result
    }

    override suspend fun deleteValuation(accountId: String, id: String) {
        maybeFail()
        deleted += accountId to id
        valuationsByAccount[accountId]?.removeAll { it.id == id }
    }

    override suspend fun updateDetails(accountId: String, institution: String?, product: String?): InvestmentSummary {
        maybeFail()
        detailsUpdated += Triple(accountId, institution, product)
        summaries = summaries.map {
            if (it.accountId == accountId) it.copy(institution = institution, product = product) else it
        }
        return summaries.first { it.accountId == accountId }
    }
}
