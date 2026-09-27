package com.fintrack.app.presentation.investments

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.fintrack.app.core.theme.StatusColors
import com.fintrack.app.core.utils.formatBRL
import com.fintrack.app.domain.models.InvestmentSummary

@Composable
fun InvestmentsScreen(viewModel: InvestmentsViewModel, onOpenInvestment: (String) -> Unit) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    InvestmentsContent(state = state, onOpenInvestment = onOpenInvestment, onRetry = viewModel::refresh)
}

@Composable
fun InvestmentsContent(
    state: InvestmentsUiState,
    onOpenInvestment: (String) -> Unit,
    onRetry: () -> Unit,
) {
    Scaffold { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
        ) {
            Text("Investimentos", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.padding(top = 16.dp))
            Text(
                "O rendimento só aparece depois que você registra a primeira avaliação (o valor da posição no extrato da corretora).",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.padding(bottom = 12.dp),
            )
            when {
                state.isLoading && state.items.isEmpty() -> CircularProgressIndicator()
                state.error != null -> {
                    Text(state.error, color = MaterialTheme.colorScheme.error)
                    Button(onClick = onRetry) { Text("Tentar novamente") }
                }
                state.items.isEmpty() -> Text(
                    "Nenhuma conta de investimento. Crie uma conta do tipo \"Investimento\" em Contas.",
                )
                else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(state.items, key = { it.accountId }) { item ->
                        InvestmentCard(item, onClick = { onOpenInvestment(item.accountId) })
                    }
                }
            }
        }
    }
}

@Composable
private fun InvestmentCard(item: InvestmentSummary, onClick: () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.weight(1f)) {
                    Text(item.accountName, style = MaterialTheme.typography.titleMedium)
                    val subtitle = listOfNotNull(item.institution, item.product).joinToString(" · ")
                    if (subtitle.isNotEmpty()) {
                        Text(subtitle, style = MaterialTheme.typography.bodySmall)
                    }
                }
                Text(formatBRL(item.balanceCents), style = MaterialTheme.typography.titleMedium)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Figure("Aportado (líquido)", formatBRL(item.netContributedCents))
                if (item.totalYieldCents == null) {
                    Figure("Rendimento", "Sem avaliação")
                } else {
                    Figure(
                        "Rendimento desde a 1ª avaliação",
                        formatBRL(item.totalYieldCents),
                        if (item.totalYieldCents < 0) StatusColors.Error else StatusColors.Ok,
                    )
                }
            }
        }
    }
}

@Composable
internal fun Figure(label: String, value: String, color: androidx.compose.ui.graphics.Color? = null) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium)
        Text(value, style = MaterialTheme.typography.titleSmall, color = color ?: MaterialTheme.colorScheme.onSurface)
    }
}

internal fun formatDate(date: String): String = date.split("-").reversed().joinToString("/")
