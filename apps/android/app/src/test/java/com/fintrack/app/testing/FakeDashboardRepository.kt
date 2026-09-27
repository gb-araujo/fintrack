package com.fintrack.app.testing

import com.fintrack.app.domain.models.AvailableComponents
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.models.PendingBill
import com.fintrack.app.domain.repositories.DashboardRepository

fun dashboardSummary(available: Long = 130_000) = DashboardSummary(
    today = "2026-09-27",
    until = "2026-09-30",
    availableCents = available,
    components = AvailableComponents(250_000, 0, 120_000, 0, 0),
    totalBalanceCents = 250_000,
    investmentsCents = 50_000,
    monthIncomeCents = 590_000,
    monthExpenseCents = 199_999,
    pendingCount = 1,
    pendingTotalCents = 120_000,
    overdueCount = 0,
    nextBills = listOf(PendingBill("b1", "Aluguel", 120_000, "2026-09-29", overdue = false)),
    futureCount = 2,
    futureTotalCents = 41_000,
)

class FakeDashboardRepository(
    var result: () -> DashboardSummary = { dashboardSummary() },
) : DashboardRepository {
    val requestedUntil = mutableListOf<String?>()

    override suspend fun dashboard(until: String?): DashboardSummary {
        requestedUntil += until
        return result()
    }
}
