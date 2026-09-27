package com.fintrack.app.presentation.dashboard

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.FinTrackTheme
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.AvailableComponents
import com.fintrack.app.domain.models.DashboardSummary
import com.fintrack.app.domain.models.PendingBill

@Composable
fun DashboardScreen(viewModel: DashboardViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    DashboardContent(uiState = uiState, onRefresh = viewModel::refresh, onLogout = viewModel::logout)
}

@Composable
fun DashboardContent(uiState: DashboardUiState, onRefresh: () -> Unit, onLogout: () -> Unit) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("FINTRACK", style = MaterialTheme.typography.headlineSmall)
                    uiState.userName?.let { name ->
                        Text("Olá, ${name.substringBefore(' ')}!", style = MaterialTheme.typography.bodyMedium)
                    }
                }
                TextButton(onClick = onLogout, enabled = !uiState.isLoggingOut) { Text("Sair") }
            }

            DashboardBody(uiState = uiState, onRetry = onRefresh)

            ApiStatusCard(
                status = uiState.apiStatus,
                isRefreshing = uiState.isRefreshing,
                onRefresh = onRefresh,
            )
        }
    }
}

@Composable
private fun DashboardBody(uiState: DashboardUiState, onRetry: () -> Unit) {
    val summary = uiState.summary
    when {
        summary != null -> {
            AvailableCard(summary)
            StatRow("Saldo total", formatBRL(summary.totalBalanceCents), "Investimentos", formatBRL(summary.investmentsCents))
            StatRow("Receitas do mês", formatBRL(summary.monthIncomeCents), "Despesas do mês", formatBRL(summary.monthExpenseCents))
            StatRow(
                "Cartões em aberto",
                formatBRL(summary.cardLiabilitiesCents),
                "Parcelas no mês",
                formatBRL(summary.monthCardExpenseCents),
            )
            PendingCard(summary)
            StatRow(
                "Compromissos futuros",
                formatBRL(summary.futureTotalCents),
                "Previstos",
                summary.futureCount.toString(),
            )
        }
        uiState.summaryError != null -> {
            Text(uiState.summaryError, color = MaterialTheme.colorScheme.error)
            Button(onClick = onRetry) { Text("Tentar novamente") }
        }
        else -> CircularProgressIndicator()
    }
}

@Composable
private fun AvailableCard(summary: DashboardSummary) {
    var expanded by remember { mutableStateOf(false) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Quanto posso gastar?", style = MaterialTheme.typography.titleMedium)
            Text(
                formatBRL(summary.availableCents),
                style = MaterialTheme.typography.headlineMedium,
                color = if (summary.availableCents < 0) StatusColors.Error else MaterialTheme.colorScheme.primary,
            )
            Text(
                if (summary.availableCents < 0) {
                    "Seus compromissos até essa data passam do que você tem em conta."
                } else {
                    "Já descontando o que está previsto até ${formatDate(summary.until)}."
                },
                style = MaterialTheme.typography.bodySmall,
            )
            TextButton(onClick = { expanded = !expanded }) {
                Text(if (expanded) "Ocultar cálculo" else "Como calculamos")
            }
            if (expanded) ComponentLines(summary.components, summary.availableCents)
        }
    }
}

@Composable
private fun ComponentLines(components: AvailableComponents, available: Long) {
    ComponentLine("+", "Saldo das contas disponíveis", components.liquidBalanceCents)
    ComponentLine("+", "Receitas pendentes", components.pendingIncomeCents)
    ComponentLine("+", "Receitas previstas (recorrências)", components.forecastIncomeCents)
    ComponentLine("+", "Entradas agendadas (resgates)", components.pendingTransfersInCents)
    ComponentLine("−", "Despesas pendentes", components.pendingExpensesCents)
    ComponentLine("−", "Despesas previstas (recorrências)", components.forecastExpensesCents)
    ComponentLine("−", "Faturas de cartão a pagar", components.invoicesCents)
    ComponentLine("−", "Saídas agendadas (aplicações)", components.pendingTransfersOutCents)
    ComponentLine("=", "Disponível", available)
}

@Composable
private fun ComponentLine(sign: String, label: String, cents: Long) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text("$sign $label", style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(formatBRL(cents), style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun StatRow(firstTitle: String, firstValue: String, secondTitle: String, secondValue: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
        StatCard(firstTitle, firstValue, Modifier.weight(1f))
        StatCard(secondTitle, secondValue, Modifier.weight(1f))
    }
}

@Composable
private fun StatCard(title: String, value: String, modifier: Modifier = Modifier) {
    Card(modifier = modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(title, style = MaterialTheme.typography.labelMedium)
            Text(value, style = MaterialTheme.typography.titleMedium)
        }
    }
}

@Composable
private fun PendingCard(summary: DashboardSummary) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text("Contas pendentes", style = MaterialTheme.typography.titleMedium)
            Text(formatBRL(summary.pendingTotalCents), style = MaterialTheme.typography.titleLarge)
            val overdue = if (summary.overdueCount > 0) " · ${summary.overdueCount} vencida(s)" else ""
            Text("${summary.pendingCount} até ${formatDate(summary.until)}$overdue", style = MaterialTheme.typography.bodySmall)
            summary.nextBills.forEach { BillLine(it) }
        }
    }
}

@Composable
private fun BillLine(bill: PendingBill) {
    val title = bill.description.ifBlank { "Despesa" }
    val suffix = buildString {
        if (bill.overdue) append(" · vencida")
        if (bill.recurring) append(if (bill.estimated) " · recorrente (estimado)" else " · recorrente")
        if (bill.invoice) append(" · fatura")
    }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(
            "$title · ${formatDate(bill.date)}$suffix",
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.weight(1f),
            color = if (bill.overdue) StatusColors.Error else MaterialTheme.colorScheme.onSurface,
        )
        Text(formatBRL(bill.amountCents), style = MaterialTheme.typography.bodySmall)
    }
}

private fun formatDate(date: String): String = date.split("-").reversed().joinToString("/")

@Composable
private fun ApiStatusCard(status: ApiStatus, isRefreshing: Boolean, onRefresh: () -> Unit) {
    val (label, color, detail) = when (status) {
        ApiStatus.Checking -> Triple("Verificando API…", StatusColors.Neutral, null)
        is ApiStatus.Online -> Triple("API online", StatusColors.Ok, "Versão ${status.version}")
        is ApiStatus.Degraded -> Triple(
            "API com problemas",
            StatusColors.Warning,
            if (status.databaseAvailable) "Versão ${status.version}" else "Banco de dados indisponível",
        )
        is ApiStatus.Offline -> Triple("API indisponível", StatusColors.Error, status.message)
    }

    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text("Status do sistema", style = MaterialTheme.typography.labelMedium)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    StatusDot(color)
                    Spacer(Modifier.width(8.dp))
                    Text(label, style = MaterialTheme.typography.titleMedium)
                }
                if (detail != null) Text(detail, style = MaterialTheme.typography.bodySmall)
            }
            OutlinedButton(onClick = onRefresh, enabled = !isRefreshing) {
                Text("Atualizar")
            }
        }
    }
}

@Composable
private fun StatusDot(color: Color) {
    Spacer(
        Modifier
            .size(10.dp)
            .background(color, CircleShape),
    )
}

@Preview(showBackground = true)
@Composable
private fun DashboardPreview() {
    FinTrackTheme {
        DashboardContent(
            DashboardUiState(userName = "Gabriel Araujo", apiStatus = ApiStatus.Online("0.0.0")),
            onRefresh = {},
            onLogout = {},
        )
    }
}
