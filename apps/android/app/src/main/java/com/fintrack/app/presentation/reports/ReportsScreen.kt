package com.fintrack.app.presentation.reports

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.core.utils.formatMonthLabel
import com.fintrack.app.domain.models.AccountExpense
import com.fintrack.app.domain.models.BudgetMonth
import com.fintrack.app.domain.models.CardExpense
import com.fintrack.app.domain.models.CategoryExpense
import com.fintrack.app.domain.models.MonthPoint
import com.fintrack.app.domain.models.NetWorthPoint

@Composable
fun ReportsScreen(viewModel: ReportsViewModel) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    ReportsContent(state = state, onSelectTab = viewModel::selectTab, onRetry = viewModel::retry)
}

@Composable
fun ReportsContent(state: ReportsUiState, onSelectTab: (ReportTab) -> Unit, onRetry: () -> Unit) {
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp)) {
            Text("Relatórios", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                "Calculados no servidor com as mesmas regras do painel, do orçamento e das faturas.",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )
            val tabs = ReportTab.entries
            PrimaryScrollableTabRow(selectedTabIndex = tabs.indexOf(state.tab)) {
                tabs.forEach { tab ->
                    Tab(
                        selected = state.tab == tab,
                        onClick = { onSelectTab(tab) },
                        text = { Text(tab.label) },
                    )
                }
            }
            when {
                state.isLoading -> CircularProgressIndicator(Modifier.padding(top = 24.dp))
                state.error != null -> Column(Modifier.padding(top = 16.dp)) {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                else -> ReportBody(state)
            }
        }
    }
}

@Composable
private fun ReportBody(state: ReportsUiState) {
    when (state.tab) {
        ReportTab.EXPENSES_BY_CATEGORY -> state.expensesByCategory?.let {
            BarListBody(total = it.totalCents) {
                items(it.items, key = { item -> item.categoryId ?: "none" }) { item -> CategoryRow(item) }
            }
        }
        ReportTab.INCOME_VS_EXPENSES -> state.incomeVsExpenses?.let { report ->
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StatRow("Receitas", formatBRL(report.incomeCents), "Despesas", formatBRL(report.expenseCents))
                Figure(
                    "Resultado",
                    formatBRL(report.netCents),
                    if (report.netCents < 0) StatusColors.Error else StatusColors.Ok,
                )
                Text(
                    report.savingsPercent?.let { "$it% das receitas" } ?: "Sem receitas no período",
                    style = MaterialTheme.typography.bodySmall,
                )
                if (report.cardExpenseCents > 0) {
                    Text(
                        "Inclui ${formatBRL(report.cardExpenseCents)} em parcelas de cartão",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
            }
        }
        ReportTab.MONTHLY_EVOLUTION -> state.monthlyEvolution?.let { report ->
            LazyColumn(Modifier.padding(top = 8.dp)) {
                items(report.items, key = { it.month }) { point -> MonthRow(point) }
            }
        }
        ReportTab.EXPENSES_BY_ACCOUNT -> state.expensesByAccount?.let {
            BarListBody(total = it.totalCents) {
                items(it.items, key = { item -> item.accountId }) { item -> AccountRow(item) }
            }
        }
        ReportTab.EXPENSES_BY_CARD -> state.expensesByCard?.let { report ->
            LazyColumn(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(report.items, key = { it.cardId }) { item -> CardExpenseRow(item) }
            }
        }
        ReportTab.CASH_FLOW -> state.cashFlow?.let { report ->
            LazyColumn(Modifier.padding(top = 8.dp)) {
                item { CashFlowLine("Saldo no início", report.openingBalanceCents, "+") }
                item { CashFlowLine("Receitas efetivadas", report.incomeCents, "+") }
                item { CashFlowLine("Transferências recebidas", report.transfersInCents, "+") }
                item { CashFlowLine("Despesas efetivadas", report.expensesCents, "−") }
                item { CashFlowLine("Pagamentos de fatura", report.cardPaymentsCents, "−") }
                item { CashFlowLine("Transferências enviadas", report.transfersOutCents, "−") }
                item { CashFlowLine("Saldo no fim", report.closingBalanceCents, "=") }
            }
        }
        ReportTab.BUDGET_HISTORY -> state.budgetHistory?.let { report ->
            LazyColumn(Modifier.padding(top = 8.dp)) {
                items(report.items, key = { it.month }) { month -> BudgetMonthRow(month) }
            }
        }
        ReportTab.NET_WORTH -> state.netWorth?.let { report ->
            LazyColumn(Modifier.padding(top = 8.dp)) {
                items(report.items, key = { it.date }) { point -> NetWorthRow(point) }
            }
        }
        ReportTab.INVESTMENTS -> state.investments?.let { report ->
            Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                StatRow("Saldo em investimentos", formatBRL(report.totalBalanceCents), "Aplicado", formatBRL(report.appliedCents))
                Figure("Resgatado no período", formatBRL(report.redeemedCents))
                Text("Resgate não é receita", style = MaterialTheme.typography.bodySmall)
                if (report.yieldCents == null) {
                    Text("Rendimento: sem avaliação registrada", style = MaterialTheme.typography.bodySmall)
                } else {
                    Figure(
                        "Rendimento no período",
                        formatBRL(report.yieldCents),
                        if (report.yieldCents < 0) StatusColors.Error else StatusColors.Ok,
                    )
                }
                report.items.forEach { InvestmentRow(it) }
                Text(
                    "Rendimento é derivado das avaliações registradas em cada conta — gerencie em Investimentos.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun BarListBody(total: Long, content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit) {
    Column(Modifier.padding(top = 8.dp)) {
        Text("Total: ${formatBRL(total)}", style = MaterialTheme.typography.titleMedium)
        LazyColumn(Modifier.padding(top = 8.dp), content = content)
    }
}

@Composable
private fun CategoryRow(item: CategoryExpense) = BarRow(item.categoryName, item.totalCents, item.percent)

@Composable
private fun AccountRow(item: AccountExpense) = BarRow(item.accountName, item.totalCents, item.percent)

@Composable
private fun BarRow(label: String, cents: Long, percent: Int) {
    Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            Text("${formatBRL(cents)} · $percent%", style = MaterialTheme.typography.bodyMedium)
        }
        LinearProgressIndicator(
            progress = { percent.coerceIn(0, 100) / 100f },
            modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
        )
    }
}

@Composable
private fun CardExpenseRow(item: CardExpense) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp)) {
            Text(item.cardName, style = MaterialTheme.typography.titleSmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Figure("Parcelas no período", formatBRL(item.installmentsCents))
                Figure("Comprado (informativo)", formatBRL(item.purchasedCents))
            }
        }
    }
}

@Composable
private fun MonthRow(point: MonthPoint) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(formatMonthLabel(point.month), style = MaterialTheme.typography.bodyMedium)
        Column {
            Text("+${formatBRL(point.incomeCents)}", style = MaterialTheme.typography.bodySmall, color = StatusColors.Ok)
            Text("−${formatBRL(point.expenseCents)}", style = MaterialTheme.typography.bodySmall, color = StatusColors.Error)
        }
        Text(
            formatBRL(point.netCents),
            style = MaterialTheme.typography.bodyMedium,
            color = if (point.netCents < 0) StatusColors.Error else StatusColors.Ok,
        )
    }
}

@Composable
private fun BudgetMonthRow(month: BudgetMonth) {
    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Column {
            Text(formatMonthLabel(month.month), style = MaterialTheme.typography.bodyMedium)
            Text(
                if (month.budgetsCount == 0) "Sem orçamento" else if (month.exceededCount > 0) "${month.exceededCount} estourado(s)" else "Dentro do limite",
                style = MaterialTheme.typography.bodySmall,
                color = if (month.exceededCount > 0) StatusColors.Error else StatusColors.Ok,
            )
        }
        Column {
            Text("Orçado ${formatBRL(month.limitCents)}", style = MaterialTheme.typography.bodySmall)
            Text("Gasto ${formatBRL(month.spentCents)}", style = MaterialTheme.typography.bodySmall)
        }
        Text(
            formatBRL(month.remainingCents),
            color = if (month.remainingCents < 0) StatusColors.Error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun NetWorthRow(point: NetWorthPoint) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(point.date.split("-").reversed().joinToString("/"), style = MaterialTheme.typography.bodyMedium)
                Text(formatBRL(point.netWorthCents), style = MaterialTheme.typography.titleSmall)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Figure("Caixa", formatBRL(point.cashCents))
                Figure("Investimentos", formatBRL(point.investmentsCents))
                Figure("Cartões", formatBRL(point.cardLiabilitiesCents), StatusColors.Error)
            }
        }
    }
}

@Composable
private fun InvestmentRow(item: com.fintrack.app.domain.models.InvestmentAccountReport) {
    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.padding(12.dp)) {
            Text(item.accountName, style = MaterialTheme.typography.titleSmall)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Figure("Saldo", formatBRL(item.balanceCents))
                Figure("Aplicado", formatBRL(item.appliedCents))
                Figure("Resgatado", formatBRL(item.redeemedCents))
                Figure(
                    "Rendimento",
                    item.yieldCents?.let(::formatBRL) ?: "—",
                    item.yieldCents?.let { if (it < 0) StatusColors.Error else StatusColors.Ok },
                )
            }
        }
    }
}

@Composable
private fun CashFlowLine(label: String, cents: Long, sign: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("$sign $label", style = MaterialTheme.typography.bodyMedium)
        Text(formatBRL(cents), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun StatRow(firstTitle: String, firstValue: String, secondTitle: String, secondValue: String) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Figure(firstTitle, firstValue, modifier = Modifier.weight(1f))
        Figure(secondTitle, secondValue, modifier = Modifier.weight(1f))
    }
}

@Composable
private fun Figure(label: String, value: String, color: Color? = null, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.titleSmall, color = color ?: MaterialTheme.colorScheme.onSurface)
    }
}
